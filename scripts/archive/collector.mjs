import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { blobSha, digest } from './source.mjs';
import { branchFor, fail, issue, parseSubmission, shaPattern, SubmissionError, validateImage } from './validation.mjs';

export function validateConfig(config) {
  const numbers = config.teamNumbers;
  if (!Array.isArray(numbers) || !numbers.length || numbers.some(n => !Number.isInteger(n) || n < 1 || n > 99)
    || new Set(numbers).size !== numbers.length) throw new Error('config/archive.json의 teamNumbers에 실제 참가 팀 번호를 중복 없이 등록해 주세요.');
  if (config.templateTreeSha !== null && !shaPattern.test(config.templateTreeSha ?? '')) throw new Error('templateTreeSha는 제출 예시 archive 폴더의 Git tree SHA여야 합니다.');
  for (const key of ['jsonBytes', 'imageBytes', 'imagePixels', 'teamBytes', 'totalBytes']) {
    if (!Number.isSafeInteger(config.limits?.[key]) || config.limits[key] <= 0) throw new Error(`잘못된 크기 제한: ${key}`);
  }
}

export function validateState(state) {
  if (state === null) return;
  if (state?.version !== 1 || !/^[a-f0-9]{64}$/.test(state.fingerprint ?? '') || !Array.isArray(state.teams)
    || typeof state.codeSha !== 'string' || !state.codeSha || typeof state.rulesKey !== 'string' || !state.rulesKey
    || !Number.isSafeInteger(state.projectCount) || state.projectCount < 0
    || state.teams.some(t => !/^W(?:0[1-9]|[1-9][0-9])$/.test(t.branch) || !['submitted', 'missing', 'template'].includes(t.status)
      || (t.status !== 'missing' && (!shaPattern.test(t.commitSha ?? '') || !shaPattern.test(t.treeSha ?? ''))))
    || new Set(state.teams.map(t => t.branch)).size !== state.teams.length
    || state.teams.filter(t => t.status === 'submitted').length !== state.projectCount) {
    throw new Error('이전 배포 명세가 올바르지 않습니다. 복구 후 다시 실행해 주세요.');
  }
}

export async function makePlan({ source, config, codeSha, rulesKey, workflowSha = 'local', previous = null, full = false }) {
  validateConfig(config); validateState(previous);
  const teams = [];
  const errors = [];
  for (const number of [...config.teamNumbers].sort((a, b) => a - b)) {
    const branch = branchFor(number);
    try {
      const snapshot = await source.snapshot(branch);
      const status = !snapshot.commitSha ? 'missing' : snapshot.treeSha === config.templateTreeSha && snapshot.treeSha ? 'template' : 'submitted';
      if (status === 'submitted' && !snapshot.treeSha) fail(branch, 'archive/', 'archive 폴더가 없습니다. archive/archive.json과 이미지를 추가해 주세요.');
      if (status !== 'submitted' && previous?.teams.some(t => t.branch === branch && t.status === 'submitted')) {
        fail(branch, 'archive/', '이전에 공개된 제출 자료가 사라졌습니다. 의도한 삭제는 운영진이 팀 등록 설정에서 처리해 주세요.');
      }
      teams.push({ ...snapshot, status });
    } catch (error) {
      if (error instanceof SubmissionError) errors.push(...error.issues); else throw error;
    }
  }
  if (errors.length) throw new SubmissionError(errors);
  const fingerprint = digest({ codeSha, rulesKey, workflowSha, config, teams: teams.map(({ branch, treeSha, status }) => ({ branch, treeSha, status })) });
  return { version: 1, codeSha, rulesKey, workflowSha, fingerprint, teams, full,
    baselinePublication: previous?.publication?.identity ?? null,
    needsBuild: full || previous?.publication?.requiresPublish === true || previous?.fingerprint !== fingerprint };
}

export async function collect({ source, plan, config, cacheDir, outputDir }) {
  validateConfig(config);
  const errors = [], projects = [], memory = new Map(), validatedImages = new Set(), usedCache = new Set();
  const stats = { downloaded: 0, reused: 0, decoded: 0, projects: 0, missing: 0 };
  let totalBytes = 0;
  await mkdir(cacheDir, { recursive: true });
  async function load(entry, branch, limit) {
    if (entry.type !== 'blob' || entry.mode !== '100644' || !shaPattern.test(entry.sha)) fail(branch, entry.path, '일반 파일만 허용합니다. 실행 파일·링크·서브모듈을 제거해 주세요.');
    if (!Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > limit) fail(branch, entry.path, `파일 크기가 제한(${limit}바이트)을 초과했습니다.`);
    if (memory.has(entry.sha)) return memory.get(entry.sha);
    const file = path.join(cacheDir, `${entry.sha}.blob`);
    usedCache.add(path.basename(file));
    let bytes;
    if (!plan.full) {
      try {
        const cached = await readFile(file);
        if (cached.length === entry.size && blobSha(cached) === entry.sha) { bytes = cached; stats.reused++; }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (!bytes) {
      bytes = await source.blob(entry.sha);
      if (bytes.length !== entry.size || blobSha(bytes) !== entry.sha) fail(branch, entry.path, '파일 내용이 Git 식별값과 다릅니다. 다시 실행해 주세요.');
      stats.downloaded++;
      await writeFile(file, bytes);
    }
    memory.set(entry.sha, bytes);
    return bytes;
  }
  for (const team of plan.teams) {
    if (team.status !== 'submitted') { stats.missing++; continue; }
    const { branch } = team;
    try {
      const files = await source.files(team);
      if (files.some(f => f.mode !== '100644' || f.type !== 'blob')) fail(branch, 'archive/', 'archive에는 일반 파일만 넣어 주세요. 실행 파일·링크·서브모듈은 허용하지 않습니다.');
      const teamSize = files.reduce((sum, file) => sum + file.size, 0);
      if (!Number.isSafeInteger(teamSize) || teamSize > config.limits.teamBytes) fail(branch, 'archive/', `팀 자료는 ${config.limits.teamBytes / 1048576}MiB 이하여야 합니다.`);
      totalBytes += teamSize;
      if (totalBytes > config.limits.totalBytes) fail(branch, 'archive/', '전체 자료 용량 제한을 초과했습니다. 운영진에게 문의해 주세요.');
      const byPath = new Map(files.map(file => [file.path, file]));
      const jsonEntry = byPath.get('archive.json');
      if (!jsonEntry) fail(branch, 'archive/archive.json', 'archive.json이 없습니다. 이름과 대소문자를 확인해 주세요.');
      const data = parseSubmission(await load(jsonEntry, branch, config.limits.jsonBytes), branch, config.limits.jsonBytes);
      const imagePaths = [...new Set([data.thumbnail, ...data.screenshots])];
      const media = new Map();
      for (const imagePath of imagePaths) {
        try {
          const entry = byPath.get(imagePath);
          if (!entry) fail(branch, imagePath, '이미지 파일이 없습니다. JSON의 경로와 실제 파일명·대소문자를 확인해 주세요.');
          const bytes = await load(entry, branch, config.limits.imageBytes);
          // The marker is specific to the validator and extension, not just the image bytes.
          const marker = path.join(cacheDir, `${digest(`${plan.rulesKey}:${entry.sha}:${path.extname(imagePath).toLowerCase()}`)}.valid`);
          usedCache.add(path.basename(marker));
          let valid = validatedImages.has(marker);
          if (!valid && !plan.full) { try { valid = (await readFile(marker, 'utf8')) === entry.sha; } catch (error) { if (error.code !== 'ENOENT') throw error; } }
          if (!valid) { await validateImage(bytes, imagePath, branch, config.limits); stats.decoded++; await writeFile(marker, entry.sha); }
          validatedImages.add(marker);
          media.set(imagePath, { bytes, sha: entry.sha });
        } catch (error) { if (error instanceof SubmissionError) errors.push(...error.issues); else throw error; }
      }
      projects.push({ team, data, media });
    } catch (error) { if (error instanceof SubmissionError) errors.push(...error.issues); else throw error; }
  }
  if (errors.length) throw new SubmissionError(errors);
  // Bound the saved cache to the current publication; old revisions must not accumulate forever.
  for (const file of await readdir(cacheDir)) {
    if (/^(?:[a-f0-9]{40}\.blob|[a-f0-9]{64}\.valid)$/.test(file) && !usedCache.has(file)) await unlink(path.join(cacheDir, file));
  }
  const published = [];
  await mkdir(path.join(outputDir, 'public', 'archives'), { recursive: true });
  for (const { team, data, media } of projects) {
    const id = `team-${team.branch.slice(1)}`;
    const urls = new Map();
    for (const [relative, { bytes, sha }] of media) {
      // Never use participant-controlled paths as output paths.
      const file = `${sha}${path.extname(relative).toLowerCase()}`;
      const directory = path.join(outputDir, 'public', 'archives', id);
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, file), bytes);
      urls.set(relative, `./archives/${id}/${file}`);
    }
    published.push({ ...data, id, thumbnail: urls.get(data.thumbnail), screenshots: data.screenshots.map(p => urls.get(p)) });
  }
  stats.projects = published.length;
  const manifest = { version: 1, fingerprint: plan.fingerprint, codeSha: plan.codeSha, rulesKey: plan.rulesKey, workflowSha: plan.workflowSha,
    baselinePublication: plan.baselinePublication ?? null, build: plan.build,
    teams: plan.teams, projectCount: published.length };
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'projects.json'), JSON.stringify(published, null, 2));
  await writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { stats, manifest, projects: published };
}
