import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { parse as parseYaml } from 'yaml';
import { collect, makePlan, validateState } from './collector.mjs';
import { blobSha, githubSource, localSource } from './source.mjs';
import { formatIssues, parseSubmission, safeImagePath, SubmissionError, validateBranch } from './validation.mjs';
import defaults from '../../config/archive.json' with { type: 'json' };

const config = { ...defaults, teamNumbers: [1] };
const data = {
  teamNumber: 1, teamName: '검증팀', title: '캠퍼스 안내', summary: '학교 공지를 찾아줍니다.',
  thumbnail: 'thumbnail.png', screenshots: ['screenshots/screen.png'], problem: '공지를 찾기 어렵습니다.',
  features: ['검색'], targetUsers: ['학생'], techStack: ['React'], techHighlights: ['출처 표시'],
  repositoryUrl: 'https://github.com/woowangthon/hub', demoUrl: '', demoVideoUrl: 'https://youtu.be/example',
  members: [{ name: '홍길동', roles: ['개발'], contribution: '검색 화면 구현' }],
};
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'archive-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  await mkdir(repo);
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'W01'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Archive test');
  await mkdir(path.join(repo, 'archive/screenshots'), { recursive: true });
  const image = async color => sharp({ create: { width: 16, height: 8, channels: 3, background: color } }).png().toBuffer();
  await writeFile(path.join(repo, 'archive/thumbnail.png'), await image('red'));
  await writeFile(path.join(repo, 'archive/screenshots/screen.png'), await image('blue'));
  const update = async value => writeFile(path.join(repo, 'archive/archive.json'), JSON.stringify(value));
  const commit = () => { git('add', '.'); git('commit', '-m', 'fixture'); };
  await update(data); commit();
  let downloads = 0;
  const raw = localSource(repo);
  const source = { ...raw, async blob(sha) { downloads++; return raw.blob(sha); } };
  const plan = (previous = null, options = {}) => makePlan({ source, config, codeSha: 'site-code', rulesKey: 'rules-1', previous, ...options });
  const cacheDir = path.join(root, 'cache'), outputDir = path.join(root, 'generated');
  const run = async (p, custom = config) => collect({ source, config: custom, plan: p, cacheDir, outputDir });
  return { root, repo, git, source, plan, run, update, commit, cacheDir, outputDir, image, downloads: () => downloads };
}

test('full first collection produces stable IDs and unchanged original image bytes', async t => {
  const f = await fixture(t); const result = await f.run(await f.plan());
  assert.deepEqual(result.stats, { downloaded: 3, reused: 0, decoded: 2, projects: 1, missing: 0 });
  assert.equal(result.projects[0].id, 'team-01');
  const image = result.projects[0].screenshots[0].replace('./', '');
  assert.deepEqual(await readFile(path.join(f.outputDir, 'public', image)), await readFile(path.join(f.repo, 'archive/screenshots/screen.png')));
});
test('unchanged input and unrelated README commit skip deployment', async t => {
  const f = await fixture(t); const first = await f.run(await f.plan());
  const same = await f.plan(first.manifest); assert.equal(same.needsBuild, false);
  await writeFile(path.join(f.repo, 'README.md'), 'unrelated'); f.commit();
  const unrelated = await f.plan(first.manifest);
  assert.notEqual(unrelated.teams[0].commitSha, first.manifest.teams[0].commitSha);
  assert.equal(unrelated.needsBuild, false);
});

test('no submitted teams publish an empty archive and support unchanged and full retries', async t => {
  const f = await fixture(t);
  f.git('branch', '-m', 'main');
  const first = await f.run(await f.plan());
  assert.deepEqual(first.projects, []);
  assert.equal(first.manifest.projectCount, 0);
  assert.equal(first.stats.downloaded, 0);
  assert.deepEqual(await readdir(path.join(f.outputDir, 'public/archives')), ['manifest.json']);
  assert.deepEqual(JSON.parse(await readFile(path.join(f.outputDir, 'public/archives/manifest.json'), 'utf8')), JSON.parse(JSON.stringify(first.manifest)));
  assert.deepEqual(JSON.parse(await readFile(path.join(f.outputDir, 'projects.json'), 'utf8')), []);
  assert.doesNotThrow(() => validateState(first.manifest));
  assert.throws(() => validateState({ ...first.manifest, projectCount: -1 }));
  assert.equal((await f.plan(first.manifest)).needsBuild, false);
  const full = await f.plan(first.manifest, { full: true });
  assert.equal(full.needsBuild, true);
  assert.equal((await f.run(full)).manifest.projectCount, 0);
  f.git('branch', 'W01');
  const submitted = await f.plan(first.manifest);
  assert.equal(submitted.needsBuild, true);
  assert.equal((await f.run(submitted)).manifest.projectCount, 1);
});
test('JSON-only update downloads one file, reuses both images without decoding', async t => {
  const f = await fixture(t); const first = await f.run(await f.plan());
  await f.update({ ...data, summary: '새로운 소개' }); f.commit();
  const result = await f.run(await f.plan(first.manifest));
  assert.deepEqual(result.stats, { downloaded: 1, reused: 2, decoded: 0, projects: 1, missing: 0 });
  assert.equal(result.projects[0].summary, '새로운 소개');
});
test('one changed image downloads and decodes just that image', async t => {
  const f = await fixture(t); const first = await f.run(await f.plan());
  const old = blobSha(await readFile(path.join(f.repo, 'archive/thumbnail.png')));
  await writeFile(path.join(f.repo, 'archive/thumbnail.png'), await f.image('green')); f.commit();
  const result = await f.run(await f.plan(first.manifest));
  assert.equal(result.stats.downloaded, 1); assert.equal(result.stats.reused, 2); assert.equal(result.stats.decoded, 1);
  await assert.rejects(readFile(path.join(f.cacheDir, `${old}.blob`)), { code: 'ENOENT' });
});
test('manual full mode downloads and decodes all input despite warm cache', async t => {
  const f = await fixture(t); const first = await f.run(await f.plan());
  const plan = await f.plan(first.manifest, { full: true }); assert.equal(plan.needsBuild, true);
  const result = await f.run(plan);
  assert.equal(result.stats.downloaded, 3); assert.equal(result.stats.reused, 0); assert.equal(result.stats.decoded, 2);
});
test('missing or corrupt cache rebuilds safely instead of dropping a project', async t => {
  const f = await fixture(t); await f.run(await f.plan());
  const image = await readFile(path.join(f.repo, 'archive/thumbnail.png'));
  await writeFile(path.join(f.cacheDir, `${blobSha(image)}.blob`), 'corrupt cache');
  const repaired = await f.run(await f.plan()); assert.equal(repaired.stats.downloaded, 1);
  await rm(f.cacheDir, { recursive: true });
  const cold = await f.run(await f.plan()); assert.equal(cold.stats.downloaded, 3); assert.equal(cold.stats.projects, 1);
});
test('validation changes invalidate markers; code-only changes still reuse assets', async t => {
  const f = await fixture(t); const first = await f.run(await f.plan());
  const codePlan = await f.plan(first.manifest, { codeSha: 'new-code' }); assert.equal(codePlan.needsBuild, true);
  assert.equal((await f.run(codePlan)).stats.decoded, 0);
  const rulesPlan = await f.plan(first.manifest, { rulesKey: 'rules-2' });
  const result = await f.run(rulesPlan); assert.equal(result.stats.downloaded, 0); assert.equal(result.stats.decoded, 2);
});
test('a cache from a failed deployment does not imply publication', async t => {
  const f = await fixture(t); const old = await f.run(await f.plan());
  await f.update({ ...data, title: '배포 재시도' }); f.commit();
  await f.run(await f.plan(old.manifest)); // Build succeeded, but no published-state update.
  const retry = await f.plan(old.manifest); assert.equal(retry.needsBuild, true);
  assert.equal((await f.run(retry)).stats.downloaded, 0);
});
test('collection uses pinned commits even when the branch advances mid-run', async t => {
  const f = await fixture(t); const plan = await f.plan();
  await f.update({ ...data, title: '아직 수집하지 않을 제목' }); f.commit();
  const result = await f.run(plan); assert.equal(result.projects[0].title, data.title);
});
test('bad JSON reports multiple field paths and does not produce publication output', async t => {
  const f = await fixture(t);
  await f.update({ ...data, title: ' ', members: [], teamNumber: 32 }); f.commit();
  await assert.rejects(f.run(await f.plan()), error => {
    assert.ok(error instanceof SubmissionError);
    for (const field of ['/title', '/members', '/teamNumber']) assert.ok(error.issues.some(i => i.field === field));
    return true;
  });
  await assert.rejects(readFile(path.join(f.outputDir, 'manifest.json')), { code: 'ENOENT' });
});
test('missing and malformed images report actionable errors together', async t => {
  const f = await fixture(t);
  await rm(path.join(f.repo, 'archive/thumbnail.png'));
  await writeFile(path.join(f.repo, 'archive/screenshots/screen.png'), 'not an image'); f.commit();
  await assert.rejects(f.run(await f.plan()), error => {
    assert.equal(error.issues.length, 2); assert.ok(error.issues.some(i => i.message.includes('대소문자')));
    assert.ok(error.issues.some(i => i.message.includes('해독'))); return true;
  });
});
test('truncated images and mismatched file extensions are rejected', async t => {
  const f = await fixture(t);
  const bytes = await f.image('red');
  await writeFile(path.join(f.repo, 'archive/thumbnail.png'), bytes.subarray(0, Math.floor(bytes.length / 2))); f.commit();
  await assert.rejects(f.run(await f.plan()), SubmissionError);
  await writeFile(path.join(f.repo, 'archive/thumbnail.png'), await sharp(bytes).jpeg().toBuffer()); f.commit();
  await assert.rejects(f.run(await f.plan()), SubmissionError);
});
test('symlink Git entries and oversized files are rejected before content download', async t => {
  const f = await fixture(t);
  const target = await f.image('red');
  const sha = f.git('hash-object', '-w', '--stdin'); // empty stdin object; metadata check happens first
  f.git('update-index', '--add', '--cacheinfo', `120000,${sha},archive/link.png`); f.git('commit', '-m', 'link fixture');
  await assert.rejects(f.run(await f.plan()), SubmissionError); assert.equal(f.downloads(), 0);
  const f2 = await fixture(t);
  await assert.rejects(f2.run(await f2.plan(), { ...config, limits: { ...config.limits, imageBytes: target.length - 1 } }), SubmissionError);
});
async function emptySubmission(f, json = '') {
  await writeFile(path.join(f.repo, 'archive/archive.json'), json);
  await rm(path.join(f.repo, 'archive/thumbnail.png'));
  await rm(path.join(f.repo, 'archive/screenshots/screen.png'));
  await writeFile(path.join(f.repo, 'archive/screenshots/.gitkeep'), '');
  await writeFile(path.join(f.repo, 'archive/archive.example.json'), JSON.stringify(data));
  f.commit();
}

test('missing/template teams are excluded, previously published disappearance blocks', async t => {
  const f = await fixture(t); const first = await f.run(await f.plan());
  const extra = { ...config, teamNumbers: [1, 2] };
  const plan = await f.plan(null, { config: extra });
  const result = await f.run(plan, extra); assert.equal(result.stats.missing, 1); assert.equal(result.stats.projects, 1);
  await emptySubmission(f);
  const templatePlan = await f.plan();
  assert.equal(templatePlan.teams[0].status, 'template');
  assert.equal((await f.run(templatePlan)).manifest.projectCount, 0);
  await assert.rejects(f.plan(first.manifest), /검증/);
});

test('README and example edits cannot turn an empty submission into a project or trigger a rebuild', async t => {
  const f = await fixture(t); await emptySubmission(f);
  const first = await f.run(await f.plan());
  await writeFile(path.join(f.repo, 'archive/README.md'), 'Updated instructions');
  await writeFile(path.join(f.repo, 'archive/archive.example.json'), '{new example');
  await writeFile(path.join(f.repo, 'archive/archive.json'), ' \r\n\t'); f.commit();
  const plan = await f.plan(first.manifest);
  assert.equal(plan.teams[0].status, 'template');
  assert.notEqual(plan.teams[0].treeSha, first.manifest.teams[0].treeSha);
  assert.equal(plan.needsBuild, false);
  assert.equal((await f.run(plan)).projects.length, 0);
});

test('partial JSON and image-only submissions still fail instead of being silently skipped', async t => {
  const f = await fixture(t); await emptySubmission(f);
  for (const json of ['{', '{}', 'null', JSON.stringify(data)]) {
    await writeFile(path.join(f.repo, 'archive/archive.json'), json); f.commit();
    const plan = await f.plan(); assert.equal(plan.teams[0].status, 'submitted');
    await assert.rejects(f.run(plan), SubmissionError);
  }
  await writeFile(path.join(f.repo, 'archive/archive.json'), '');
  await writeFile(path.join(f.repo, 'archive/thumbnail.png'), await f.image('red')); f.commit();
  assert.equal((await f.plan()).teams[0].status, 'submitted');
  await assert.rejects(f.run(await f.plan()), SubmissionError);
  await rm(path.join(f.repo, 'archive/archive.json')); f.commit();
  await assert.rejects(f.run(await f.plan()), error => error.issues.some(i => i.message.includes('archive.json이 없습니다')));
});

test('blank submissions cannot bypass invalid metadata, limits, UTF-8 or blob integrity', async t => {
  const f = await fixture(t); await emptySubmission(f, ' ');
  const raw = localSource(f.repo);
  await assert.rejects(f.plan(null, { source: { ...raw, blob: async () => Buffer.from('x') } }), /검증/);
  const files = await raw.files(await raw.snapshot('W01'));
  for (const patch of [{ mode: '120000' }, { size: config.limits.jsonBytes + 1 }, { size: -1 }]) {
    await assert.rejects(f.plan(null, { source: { ...raw, files: async () => files.map(e => e.path === 'archive.json' ? { ...e, ...patch } : e) } }), /검증/);
  }
  await writeFile(path.join(f.repo, 'archive/archive.json'), Buffer.from([255])); f.commit();
  await assert.rejects(f.run(await f.plan()), SubmissionError);
});

test('after artifact expiry site state supports unchanged, incremental, full and disappearance checks', async t => {
  const f = await fixture(t);
  const plan = await f.plan(); plan.build = { identity: '5:1', runId: 5, attempt: 1 };
  await f.run(plan);
  const liveState = await readFile(path.join(f.outputDir, 'public/archives/manifest.json'), 'utf8');
  const replies = {
    '/actions/runs?branch=main&per_page=100&page=1': { workflow_runs: [{ id: 5, run_attempt: 1, updated_at: '2026-07-01T00:02:00Z', head_branch: 'main', event: 'schedule', path: '.github/workflows/archive-auto.yml', head_repository: { full_name: 'owner/hub' } }] },
    '/actions/runs/5/attempts/1/jobs?per_page=100&page=1': { jobs: [{ name: 'Publish Archive (build 5:1)', steps: [{ name: 'Deploy Archive Pages', conclusion: 'success', started_at: '2026-07-01T00:01:00Z', completed_at: '2026-07-01T00:02:00Z' }] }] },
    '/deployments?environment=github-pages&per_page=100&page=1': [],
    '/actions/artifacts?name=archive-published-state-5-1&per_page=100': { artifacts: [] },
    '/actions/artifacts?name=archive-candidate-state-5-1&per_page=100': { artifacts: [] },
  };
  const remote = githubSource('owner/hub', 'token', async (url, options) => {
    if (url === 'https://owner.github.io/hub/archives/manifest.json?build=5%3A1') {
      assert.equal(options.headers, undefined); return new Response(liveState);
    }
    const key = url.replace('https://api.github.com/repos/owner/hub', '');
    assert(Object.hasOwn(replies, key), key); return Response.json(replies[key]);
  });
  const previous = await remote.publishedState();
  assert.equal((await f.plan(previous)).needsBuild, false);
  await f.update({ ...data, summary: '90일 이후 수정' }); f.commit();
  const incremental = await f.run(await f.plan(previous));
  assert.deepEqual(incremental.stats, { downloaded: 1, reused: 2, decoded: 0, projects: 1, missing: 0 });
  assert.equal((await f.run(await f.plan(previous, { full: true }))).stats.downloaded, 3);
  await emptySubmission(f);
  await assert.rejects(f.plan(previous), SubmissionError);
});
test('same filenames across teams cannot collide and team identity is stable', async t => {
  const f = await fixture(t); f.git('checkout', '-b', 'W02');
  await f.update({ ...data, teamNumber: 2, teamName: '두번째 팀' }); f.commit();
  const both = { ...config, teamNumbers: [1, 2] };
  const result = await f.run(await f.plan(null, { config: both }), both);
  assert.equal(result.projects.length, 2); assert.notEqual(result.projects[0].thumbnail, result.projects[1].thumbnail);
  const full = await f.run(await f.plan(result.manifest, { config: both, full: true }), both);
  assert.equal(full.stats.decoded, 2); // Same bytes shared by teams are decoded once per run.
});
test('a damaged published manifest blocks rather than silently treating it as a first deployment', async t => {
  const f = await fixture(t); const first = await f.run(await f.plan());
  await assert.rejects(f.plan({ ...first.manifest, teams: [] }), /배포 명세/);
  await assert.rejects(f.plan({ ...first.manifest, teams: [first.manifest.teams[0], first.manifest.teams[0]], projectCount: 2 }), /배포 명세/);
  assert.equal((await f.plan(first.manifest, { workflowSha: 'changed-workflow' })).needsBuild, true);
  assert.equal((await f.plan({ ...first.manifest, publication: { identity: '8:1:uncertain', requiresPublish: true } })).needsBuild, true);
});
test('demoUrl alone may be omitted, whitespace required fields and unsafe URLs fail', () => {
  const withoutDemo = { ...data }; delete withoutDemo.demoUrl;
  assert.equal(parseSubmission(Buffer.from(JSON.stringify(withoutDemo)), 'W01', 102400).demoUrl, '');
  for (const patch of [{ demoUrl: 'javascript:alert(1)' }, { demoUrl: 'https://user:pass@example.com' }, { members: [] }, { techHighlights: [] }, { summary: '   ' }]) {
    assert.throws(() => parseSubmission(Buffer.from(JSON.stringify({ ...data, ...patch })), 'W01', 102400), SubmissionError);
  }
});
test('branch/path rules and workflow annotations cannot be injected', () => {
  for (const branch of ['W00', 'W1', 'W100', 'TEAM01', 'W01-팀', 'W01\n']) assert.throws(() => validateBranch(branch));
  for (const input of ['../a.png', '/a.png', 'a\\b.png', 'https://a/a.png', 'a/%2e%2e/b.png', './a.png', 'a.svg']) assert.equal(safeImagePath(input), false);
  assert.equal(safeImagePath('screenshots/추가 화면.png'), true);
  const report = formatIssues([{ branch: 'W01\n::warning::x', field: '/title,x', message: 'bad\n::warning::oops' }]);
  assert.equal(report.annotations.split('\n').length, 1); assert.ok(report.annotations.includes('%0A'));
});
test('two deployment workflows share one lock; Pages runs only after successful build', async () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const auto = parseYaml(await readFile(path.join(root, '.github/workflows/archive-auto.yml'), 'utf8'));
  const full = parseYaml(await readFile(path.join(root, '.github/workflows/archive-full.yml'), 'utf8'));
  assert.equal(auto.on.schedule[0].cron, '10 15 * * *');
  assert.deepEqual(auto.on.push.branches, ['W*']);
  assert.equal(full.jobs.rebuild.with.full_rebuild, true); assert.equal(full.concurrency, undefined);
  assert.equal(auto.jobs.deploy.steps.find(s => s.id === 'deployment').with.artifact_name, '${{ needs.build.outputs.pages_artifact }}');
  assert.equal(auto.jobs.build.outputs.pages_artifact, '${{ steps.plan.outputs.pages_artifact }}');
  assert.equal(auto.jobs.deploy.needs, 'build'); assert.equal(auto.jobs.build.permissions.pages, undefined);
  assert.ok(auto.jobs.build.steps.find(s => s.name === 'Restore Archive Cache').if.includes('!inputs.full_rebuild'));
  assert.ok(auto.jobs.deploy.steps.findIndex(s => s.id === 'deployment') < auto.jobs.deploy.steps.findIndex(s => s.with?.name?.startsWith('archive-published-state-')));
  for (const job of Object.values(auto.jobs)) for (const step of job.steps) if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/);
});
