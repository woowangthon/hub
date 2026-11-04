import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateState } from './collector.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const manifest = JSON.parse(await readFile(path.join(root, '.archive/generated/manifest.json'), 'utf8'));
const data = JSON.parse(await readFile(path.join(root, '.archive/generated/projects.json'), 'utf8'));
validateState(manifest);
if (!Array.isArray(data) || data.length !== manifest?.projectCount) throw new Error('유효한 수집 데이터와 배포 명세가 필요합니다.');
for (const entry of ['typescript/bin/tsc', 'vite/bin/vite.js']) {
  const script = path.join(root, 'node_modules', entry);
  const result = spawnSync(process.execPath, [script, ...(entry.includes('tsc') ? ['--noEmit'] : ['build'])], {
    cwd: root, stdio: 'inherit', env: { ...process.env, ARCHIVE_DATA: 'collected' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
