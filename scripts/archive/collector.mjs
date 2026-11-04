import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateState } from './publication.mjs';
export { validateState } from './publication.mjs';
import { blobSha, digest } from './source.mjs';
import { branchFor, fail, issue, parseSubmission, shaPattern, SubmissionError, validateImage } from './validation.mjs';

export function validateConfig(config) {
  const numbers = config.teamNumbers;
  if (!Array.isArray(numbers) || !numbers.length || numbers.some(n => !Number.isInteger(n) || n < 1 || n > 99)
    || new Set(numbers).size !== numbers.length) throw new Error('config/archive.json의 teamNumbers에 실제 참가 팀 번호를 중복 없이 등록해 주세요.');
  for (const key of ['jsonBytes', 'imageBytes', 'imagePixels', 'teamBytes', 'totalBytes']) {
    if (!Number.isSafeInteger(config.limits?.[key]) || config.limits[key] <= 0) throw new Error(`잘못된 크기 제한: ${key}`);
  }
}

// Only these non-submission files may accompany an untouched blank JSON.
const templateSupportFiles = new Set(['README.md', 'archive.example.json', 'screenshots/.gitkeep']);
export async function submissionStatus(source, snapshot, config) {
  const { branch } = snapshot;
  if (!snapshot.commitSha) return 'missing';
  if (!snapshot.treeSha) fail(branch, 'archive/', 'archive 폴더가 없습니다. archive/archive.json과 이미지를 추가해 주세요.');
  const files = await source.files(snapshot);
  const json = files.find(f => f.path === 'archive.json');
  // Partial submissions and unsupported extra files must undergo normal validation.
  if (!json || files.some(f => f.path !== 'archive.json' && !templateSupportFiles.has(f.path))) return 'submitted';
  if (files.some(f => f.mode !== '100644' || f.type !== 'blob' || !shaPattern.test(f.sha)
    || !Number.isSafeInteger(f.size) || f.size < 0)) fail(branch, 'archive/', '일반 파일과 올바른 Git 파일 정보만 허용합니다. 링크나 실행 파일을 제거해 주세요.');
  if (files.reduce((sum, f) => sum + f.size, 0) > config.limits.teamBytes) fail(branch, 'archive/', `팀 자료는 ${config.limits.teamBytes / 1048576}MiB 이하여야 합니다.`);
  if (json.size > config.limits.jsonBytes) fail(branch, 'archive/archive.json', `JSON은 ${config.limits.jsonBytes}바이트 이하여야 합니다.`);
  // A zero-byte Git blob is identifiable without another download.
  if (json.size === 0 && json.sha === blobSha(Buffer.alloc(0))) return 'template';
  const bytes = await source.blob(json.sha);
  if (bytes.length !== json.size || blobSha(bytes) !== json.sha) fail(branch, 'archive/archive.json', '파일 내용이 Git 식별값과 다릅니다. 다시 실행해 주세요.');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim() === '' ? 'template' : 'submitted'; }
  catch { return 'submitted'; }
}

export async function makePlan({ source, config, codeSha, rulesKey, workflowSha = 'local', previous = null, full = false }) {
  validateConfig(config); validateState(previous);
  const teams = [];
  const errors = [];
  for (const number of [...config.teamNumbers].sort((a, b) => a - b)) {
    const branch = branchFor(number);
    try {
      const snapshot = await source.snapshot(branch);
      const status = await submissionStatus(source, snapshot, config);
      if (status !== 'submitted' && previous?.teams.some(t => t.branch === branch && t.status === 'submitted')) {
        fail(branch, 'archive/', '이전에 공개된 제출 자료가 사라졌습니다. 의도한 삭제는 운영진이 팀 등록 설정에서 처리해 주세요.');
      }
      teams.push({ ...snapshot, status });
    } catch (error) {
      if (error instanceof SubmissionError) errors.push(...error.issues); else throw error;
    }
  }
  if (errors.length) throw new SubmissionError(errors);
  const fingerprint = digest({ codeSha, rulesKey, workflowSha, config, teams: teams.map(({ branch, treeSha, status }) => ({ branch, treeSha: status === 'submitted' ? treeSha : null, status })) });
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
  const manifestText = JSON.stringify(manifest, null, 2);
  if (Buffer.byteLength(manifestText) > 1048576) throw new Error('배포 기록은 1MiB 이하여야 합니다.');
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'projects.json'), JSON.stringify(published, null, 2));
  await writeFile(path.join(outputDir, 'manifest.json'), manifestText);
  // Published alongside the site, independently of Actions artifact retention.
  await writeFile(path.join(outputDir, 'public', 'archives', 'manifest.json'), manifestText);
  return { stats, manifest, projects: published };
}
