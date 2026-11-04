import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentPublication, guardBaseline } from './publication.mjs';

const timestamp = minute => `2026-11-04T00:${String(minute).padStart(2, '0')}:00Z`;
const run = (id, minute, attempt = 1) => ({ id, run_attempt: attempt, updated_at: timestamp(minute), head_branch: 'main', event: 'schedule', path: '.github/workflows/archive-auto.yml', head_repository: { full_name: 'owner/hub' } });
const job = (id, buildAttempt, minute, conclusion = 'success') => ({ name: `Pages 게시·성공 명세 저장 (build ${id}:${buildAttempt})`, steps: [{ name: '사이트 게시', started_at: timestamp(minute - 1), completed_at: timestamp(minute), conclusion }] });
const marker = (id, attempt, candidate = false) => ({ id: 100 + id, name: `archive-${candidate ? 'candidate' : 'published'}-state-${id}-${attempt}`, size_in_bytes: 500, expired: false, workflow_run: { id, head_branch: 'main' } });
function api({ runs = [], jobs = {}, artifacts = [], deployments = [], statuses = {} } = {}) {
  return {
    async list(path) {
      if (path.startsWith('/actions/runs?')) return runs;
      if (path.startsWith('/deployments?')) return deployments;
      const match = path.match(/runs\/(\d+)\/attempts\/(\d+)\/jobs/);
      if (!match || !jobs[`${match[1]}:${match[2]}`]) throw new Error(`Missing mock: ${path}`);
      return jobs[`${match[1]}:${match[2]}`];
    },
    async json(path) {
      if (path.startsWith('/actions/artifacts?')) return { artifacts: artifacts.filter(a => path.includes(`name=${a.name}&`)) };
      const id = path.match(/deployments\/(\d+)\/statuses/)?.[1];
      if (id && statuses[id]) return statuses[id];
      throw new Error(`Missing mock: ${path}`);
    },
  };
}

test('first failed attempt BEFORE Pages allows scheduled or full retry', async () => {
  const source = api({ runs: [run(1, 5)], jobs: { '1:1': [job(1, 1, 4, 'skipped')] },
    deployments: [{ id: 10, created_at: timestamp(1) }],
    statuses: { 10: [{ state: 'failure', log_url: 'https://github.com/owner/hub/actions/runs/1/job/100' }] } });
  assert.equal(await currentPublication(source, 'owner/hub'), null);
  assert.doesNotThrow(() => guardBaseline({ baselinePublication: null }, null));
});
test('new publication with failed marker upload recovers ITS immutable candidate, never older state', async () => {
  const source = api({ runs: [run(1, 5), run(2, 10)], jobs: { '1:1': [job(1, 1, 4)], '2:1': [job(2, 1, 9)] }, artifacts: [marker(1, 1), marker(2, 1, true)] });
  const result = await currentPublication(source, 'owner/hub');
  assert.equal(result.identity, '2:1:published'); assert.equal(result.artifact.name, 'archive-candidate-state-2-1'); assert.equal(result.recovered, true);
});
test('missing both records after newer success fails instead of falling back', async () => {
  const source = api({ runs: [run(1, 5), run(2, 10)], jobs: { '2:1': [job(2, 1, 9)] }, artifacts: [marker(1, 1)] });
  await assert.rejects(currentPublication(source, 'owner/hub'), /고정된 빌드 명세/);
});
test('a failed Pages polling step uses its candidate conservatively and exact candidate may retry', async () => {
  const source = api({ runs: [run(2, 10)], jobs: { '2:1': [job(2, 1, 9, 'failure')] }, artifacts: [marker(2, 1, true)] });
  const current = await currentPublication(source, 'owner/hub');
  assert.equal(current.success, false); assert.equal(current.identity, '2:1:uncertain');
  assert.doesNotThrow(() => guardBaseline({ baselinePublication: null, build: { identity: '2:1' } }, current));
  assert.throws(() => guardBaseline({ baselinePublication: null, build: { identity: '2:2' } }, current), /다른 배포/);
});
test('new build planned against uncertain publication is allowed; stale retry after newer success is blocked', () => {
  const pending = { identity: '2:1:uncertain', buildIdentity: '2:1', success: false };
  assert.doesNotThrow(() => guardBaseline({ baselinePublication: pending.identity, build: { identity: '3:1' } }, pending));
  const current = { identity: '4:1:published', buildIdentity: '4:1', success: true };
  assert.throws(() => guardBaseline({ baselinePublication: '1:1:published', build: { identity: '2:1' } }, current), /오래된 후보/);
});
test('successful earlier attempt is not erased by a later failure before Pages', async () => {
  const source = api({ runs: [run(2, 12, 2)], jobs: { '2:1': [job(2, 1, 9)], '2:2': [job(2, 1, 11, 'skipped')] }, artifacts: [marker(2, 1)] });
  assert.equal((await currentPublication(source, 'owner/hub')).identity, '2:1:published');
});
test('publication ordering uses completion time, not creation order of run IDs', async () => {
  const source = api({ runs: [run(2, 10), run(1, 15, 2)], jobs: { '2:1': [job(2, 1, 9)], '1:1': [job(1, 1, 4)], '1:2': [job(1, 1, 14)] }, artifacts: [marker(1, 2)] });
  assert.equal((await currentPublication(source, 'owner/hub')).identity, '1:2:published');
});
test('unrecognized external deployment and expired candidate fail closed', async () => {
  await assert.rejects(currentPublication(api({ deployments: [{ id: 3, created_at: timestamp(3) }], statuses: { 3: [{ state: 'success', log_url: 'https://example.com' }] } }), 'owner/hub'), /연결할 수 없는/);
  await assert.rejects(currentPublication(api({ runs: [run(1, 5)], jobs: { '1:1': [job(1, 1, 4, 'failure')] }, artifacts: [{ ...marker(1, 1, true), expired: true }] }), 'owner/hub'), /만료/);
});
