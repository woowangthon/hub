import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { collect, makePlan, validateConfig } from './archive/collector.mjs';
import { digest, githubSource, localSource } from './archive/source.mjs';
import { branchFor, fail, formatIssues, SubmissionError, validateBranch } from './archive/validation.mjs';

const root = path.resolve(import.meta.dirname, '..');
const stateDir = path.join(root, '.archive');
export async function rulesKey(config) {
  const files = ['schemas/archive.schema.json', 'scripts/archive/validation.mjs', 'scripts/archive/collector.mjs', 'scripts/archive/source.mjs', 'scripts/archive/publication.mjs', 'pnpm-lock.yaml'];
  return digest([config.limits, ...await Promise.all(files.map(file => readFile(path.join(root, file), 'utf8')))]);
}
async function output(name, value) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}
async function summary(text) {
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}
export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    repo: { type: 'string' }, previous: { type: 'string' }, config: { type: 'string' },
    branch: { type: 'string' }, sha: { type: 'string' }, full: { type: 'boolean', default: false },
  } });
  const command = positionals[0];
  if (positionals.length !== 1 || !['plan', 'collect', 'validate'].includes(command)) throw new Error('사용법: node scripts/archive.mjs plan|collect|validate [--repo 로컬저장소] [--full]');
  if (values.previous && !values.repo) throw new Error('--previous는 로컬 검증에서만 사용할 수 있습니다.');
  const config = JSON.parse(await readFile(values.config ?? path.join(root, 'config/archive.json'), 'utf8'));
  validateConfig(config);
  const source = values.repo ? localSource(values.repo) : githubSource(process.env.GH_REPO, process.env.GH_TOKEN);
  const key = await rulesKey(config);
  const codeSha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  await mkdir(stateDir, { recursive: true });
  if (command === 'plan') {
    const previous = values.previous ? JSON.parse(await readFile(values.previous, 'utf8')) : values.repo ? null : await source.publishedState();
    const plan = await makePlan({ source, config, codeSha, rulesKey: key, workflowSha: process.env.GITHUB_SHA ?? 'local', previous, full: values.full });
    if (process.env.GITHUB_RUN_ID) {
      const runId = Number(process.env.GITHUB_RUN_ID), attempt = Number(process.env.GITHUB_RUN_ATTEMPT);
      if (!Number.isSafeInteger(runId) || !Number.isSafeInteger(attempt)) throw new Error('잘못된 실행 식별값입니다.');
      plan.build = { identity: `${runId}:${attempt}`, runId, attempt };
    }
    await writeFile(path.join(stateDir, 'plan.json'), JSON.stringify(plan, null, 2));
    await output('needs_build', plan.needsBuild);
    await output('fingerprint', plan.fingerprint);
    await output('code_sha', codeSha);
    await output('build_attempt', process.env.GITHUB_RUN_ATTEMPT ?? 'local');
    await output('pages_artifact', `github-pages-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`);
    await output('candidate_artifact', `archive-candidate-state-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`);
    if (previous?.publication?.recovered) await summary('최근 게시 시도의 고정 빌드 명세로 상태를 복구했습니다. 불확실한 게시 시도는 변경이 없어도 재게시합니다.');
    await summary(plan.needsBuild ? `자료 수집 예정: ${plan.teams.filter(t => t.status === 'submitted').length}개 팀 · ${plan.full ? '전체 재수집' : '캐시 재사용'}` : '제출 자료·코드·설정 변경 없음: 빌드와 배포를 생략합니다.');
    return;
  }
  let plan;
  if (command === 'validate') {
    const branch = values.branch;
    validateBranch(branch ?? '');
    if (!config.teamNumbers.map(branchFor).includes(branch)) fail(branch, 'branch', '등록되지 않은 팀입니다. 운영진에게 팀 번호 등록을 요청해 주세요.');
    const snapshot = await source.snapshot(branch, values.sha);
    if (!snapshot.treeSha) fail(branch, 'archive/', 'archive 폴더가 없습니다. 제출 예시의 폴더 구조를 확인해 주세요.');
    if (snapshot.treeSha === config.templateTreeSha) fail(branch, 'archive/', '제출 예시가 그대로입니다. JSON과 이미지를 실제 작품 자료로 교체해 주세요.');
    plan = { codeSha, rulesKey: key, fingerprint: digest(snapshot), full: true, teams: [{ ...snapshot, status: 'submitted' }] };
  } else {
    plan = JSON.parse(await readFile(path.join(stateDir, 'plan.json'), 'utf8'));
    if (plan.codeSha !== codeSha || plan.rulesKey !== key) throw new Error('코드·검증 규칙이 변경되었습니다. plan부터 다시 실행해 주세요.');
    if (!plan.needsBuild) { await summary('변경 없음: 수집 생략'); return; }
  }
  // Fixed, tool-owned directories only; never delete a participant-supplied path.
  const generated = path.join(stateDir, command === 'validate' ? 'validation' : 'generated');
  await rm(generated, { recursive: true, force: true });
  const result = await collect({ source, plan, config, cacheDir: path.join(stateDir, command === 'validate' ? 'validation-cache' : 'cache'), outputDir: generated });
  if (command === 'collect') {
    await rm(path.join(root, 'public/archives'), { recursive: true, force: true });
    await cp(path.join(generated, 'public/archives'), path.join(root, 'public/archives'), { recursive: true });
  }
  const { stats } = result;
  await summary(`## ${command === 'validate' ? '제출 검사 성공' : '수집 성공'}\n\n| 작품 | 미제출 | 다운로드 파일 | 재사용 파일 | 이미지 해독 검사 |\n|---|---|---|---|---|\n| ${stats.projects} | ${stats.missing} | ${stats.downloaded} | ${stats.reused} | ${stats.decoded} |`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(async error => {
    const report = formatIssues(error instanceof SubmissionError ? error.issues : [{ branch: '운영', field: 'workflow', message: error.message }]);
    console.error(report.annotations);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report.summary);
    process.exitCode = 1;
  });
}
