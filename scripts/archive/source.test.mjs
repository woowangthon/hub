import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { githubSource } from './source.mjs';

const sha = 'a'.repeat(40), tree = 'b'.repeat(40), archiveTree = 'c'.repeat(40);
const state = { version: 1, fingerprint: 'd'.repeat(64), codeSha: sha, rulesKey: 'rules', projectCount: 0, teams: [], build: { identity: '5:1' }, publication: { identity: '5:1:published' } };
const pagesUrl = 'https://owner.github.io/hub/archives/manifest.json?build=5%3A1';
const noArtifacts = {
  '/actions/artifacts?name=archive-published-state-5-1&per_page=100': { artifacts: [] },
  '/actions/artifacts?name=archive-candidate-state-5-1&per_page=100': { artifacts: [] },
};
const artifact = { id: 8, name: 'archive-published-state-5-1', size_in_bytes: 100, expired: false, workflow_run: { id: 5, head_branch: 'main' } };
const run = { id: 5, head_branch: 'main', run_attempt: 1, updated_at: '2026-11-04T00:05:00Z', event: 'schedule', path: '.github/workflows/archive-auto.yml', head_repository: { full_name: 'owner/hub' } };
const history = {
  '/actions/runs?branch=main&per_page=100&page=1': { workflow_runs: [run] },
  '/actions/runs/5/attempts/1/jobs?per_page=100&page=1': { jobs: [{ name: 'Publish Archive (build 5:1)', steps: [{ name: 'Deploy Archive Pages', conclusion: 'success', started_at: '2026-11-04T00:01:00Z', completed_at: '2026-11-04T00:02:00Z' }] }] },
  '/deployments?environment=github-pages&per_page=100&page=1': [],
};
function mock(entries) {
  const calls = [];
  return { calls, fetcher: async (url, options) => {
    calls.push({ url, options });
    const key = url.replace('https://api.github.com/repos/owner/hub', '');
    if (!(key in entries)) throw new Error(`Unexpected request ${key}`);
    const value = entries[key];
    return value instanceof Response ? value.clone() : Response.json(value);
  } };
}
test('GitHub source pins commit/root/archive tree and reads blobs without checking out participant code', async () => {
  const m = mock({
    '/git/ref/heads/W01': { object: { sha } },
    [`/git/commits/${sha}`]: { tree: { sha: tree } },
    [`/git/trees/${tree}`]: { tree: [{ path: 'archive', type: 'tree', mode: '040000', sha: archiveTree }] },
    [`/git/trees/${archiveTree}?recursive=1`]: { tree: [{ path: 'archive.json', mode: '100644', type: 'blob', sha, size: 2 }], truncated: false },
    [`/git/blobs/${sha}`]: { encoding: 'base64', content: 'e30=' },
  });
  const source = githubSource('owner/hub', 'secret', m.fetcher);
  const snapshot = await source.snapshot('W01');
  assert.equal(snapshot.commitSha, sha); assert.equal(snapshot.treeSha, archiveTree);
  assert.equal((await source.files(snapshot)).length, 1);
  assert.equal((await source.blob(sha)).toString(), '{}');
  assert.ok(m.calls.every(c => c.options.headers.Authorization === 'Bearer secret'));
});
test('404 missing branch differs from denied/rate-limited API', async () => {
  const m = mock({ '/git/ref/heads/W01': new Response('', { status: 404 }) });
  assert.equal((await githubSource('owner/hub', '', m.fetcher).snapshot('W01')).commitSha, null);
  for (const status of [403, 429, 500]) {
    const denied = mock({ '/git/ref/heads/W01': new Response('', { status }) });
    await assert.rejects(githubSource('owner/hub', '', denied.fetcher).snapshot('W01'), /GitHub 조회 실패/);
  }
});
test('successful-state artifact is separate from cache and redirected downloads receive no token', async () => {
  const zip = zipSync({ 'manifest.json': strToU8(JSON.stringify(state)) });
  const m = mock({
    '/actions/artifacts?name=archive-published-state-5-1&per_page=100': { artifacts: [artifact] },
    ...history,
    '/actions/artifacts/8/zip': new Response(null, { status: 302, headers: { location: 'https://storage.example/state.zip' } }),
    'https://storage.example/state.zip': new Response(zip),
  });
  const result = await githubSource('owner/hub', 'secret', m.fetcher).publishedState();
  assert.equal(result.fingerprint, state.fingerprint); assert.equal(result.publication.requiresPublish, false);
  assert.equal(m.calls.at(-1).options.headers, undefined);
});
test('expired and deleted artifacts recover the matching published site without forwarding credentials', async () => {
  for (const expired of [false, true]) {
    const m = mock({ ...history, ...noArtifacts,
      ...(expired ? { '/actions/artifacts?name=archive-published-state-5-1&per_page=100': { artifacts: [{ ...artifact, expired: true }] } } : {}),
      [pagesUrl]: state,
    });
    const result = await githubSource('owner/hub', 'secret', m.fetcher).publishedState();
    assert.equal(result.fingerprint, state.fingerprint);
    assert.equal(result.publication.identity, '5:1:published');
    assert.equal(result.publication.requiresPublish, false);
    assert.equal(result.publication.recovered, true);
    assert.equal(m.calls.at(-1).options.headers, undefined);
    assert.equal(m.calls.at(-1).options.redirect, 'error');
  }
});

test('site recovery rejects stale, malformed, oversized or absent state', async () => {
  for (const page of [
    { ...state, build: { identity: '4:1' } },
    { ...state, projectCount: 1 },
    { ...state, projectCount: -1 },
    null,
    new Response('{'),
    { ...state, padding: ' '.repeat(1048577) },
    new Response('', { status: 404 }),
    new Response(null, { status: 302, headers: { location: 'https://example.com' } }),
  ]) {
    const m = mock({ ...history, ...noArtifacts, [pagesUrl]: page });
    await assert.rejects(githubSource('owner/hub', '', m.fetcher).publishedState());
  }
});
test('participant branch artifacts cannot impersonate a main publication', async () => {
  const m = mock({ ...history,
    '/actions/artifacts?name=archive-published-state-5-1&per_page=100': { artifacts: [{ ...artifact, workflow_run: { id: 5, head_branch: 'W01' } }] },
    '/actions/artifacts?name=archive-candidate-state-5-1&per_page=100': { artifacts: [] },
    [pagesUrl]: new Response('', { status: 404 }),
  });
  await assert.rejects(githubSource('owner/hub', '', m.fetcher).publishedState(), /사이트의 배포 기록/);
});
