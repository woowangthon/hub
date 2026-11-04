import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { fail, shaPattern, validateBranch } from './validation.mjs';
import { githubClient, readLimited } from './github.mjs';
import { currentPublication, validateState } from './publication.mjs';

export const blobSha = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const checkSha = sha => { if (!shaPattern.test(sha)) throw new Error('잘못된 Git SHA입니다.'); return sha; };

// Local adapter reads Git objects without checking out or executing participant files.
export function localSource(repository) {
  const git = (...args) => execFileSync('git', ['-C', repository, ...args], { maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  return {
    async snapshot(branch, commit) {
      validateBranch(branch);
      let sha;
      try { sha = git('rev-parse', '--verify', commit ? `${checkSha(commit)}^{commit}` : `refs/heads/${branch}^{commit}`).toString().trim(); }
      catch { return { branch, commitSha: null, treeSha: null }; }
      let treeSha;
      try { treeSha = git('rev-parse', '--verify', `${sha}:archive`).toString().trim(); }
      catch { return { branch, commitSha: sha, treeSha: null }; }
      return { branch, commitSha: sha, treeSha: checkSha(treeSha) };
    },
    async files(snapshot) {
      return git('ls-tree', '-r', '-l', '-z', checkSha(snapshot.treeSha)).toString().split('\0').filter(Boolean).map(line => {
        const [meta, path] = line.split('\t');
        const [mode, type, sha, size] = meta.trim().split(/\s+/);
        return { path, mode, type, sha, size: Number(size) };
      });
    },
    async blob(sha) { return git('cat-file', 'blob', checkSha(sha)); },
  };
}

export function githubSource(repository, token, fetcher = fetch) {
  const api = githubClient(repository, token, fetcher);
  const { request, json } = api;
  return {
    async snapshot(branch, commit) {
      validateBranch(branch);
      const ref = commit ? { object: { sha: checkSha(commit) } } : await json(`/git/ref/heads/${branch}`, true);
      if (!ref) return { branch, commitSha: null, treeSha: null };
      const sha = checkSha(ref.object.sha);
      const commitData = await json(`/git/commits/${sha}`);
      const root = await json(`/git/trees/${checkSha(commitData.tree.sha)}`);
      const entry = root.tree.find(entry => entry.path === 'archive');
      if (entry && (entry.type !== 'tree' || entry.mode !== '040000')) fail(branch, 'archive/', 'archive는 일반 폴더여야 합니다. 링크·서브모듈은 사용할 수 없습니다.');
      return { branch, commitSha: sha, treeSha: entry?.sha ?? null };
    },
    async files(snapshot) {
      const result = await json(`/git/trees/${checkSha(snapshot.treeSha)}?recursive=1`);
      if (result.truncated) fail(snapshot.branch, 'archive/', '파일 목록이 너무 큽니다. 제출에 필요한 파일만 남겨 주세요.');
      return result.tree.filter(entry => entry.type !== 'tree');
    },
    async blob(sha) {
      const result = await json(`/git/blobs/${checkSha(sha)}`);
      if (result.encoding !== 'base64') throw new Error('지원하지 않는 Git blob 인코딩입니다.');
      return Buffer.from(result.content, 'base64');
    },
    async publishedState() {
      const publication = await currentPublication(api, repository, fetcher);
      if (!publication) return null;
      const { artifact } = publication;
      if (!artifact) return { ...publication.state, publication: { identity: publication.identity, requiresPublish: !publication.success, recovered: true } };
      const response = await request(`/actions/artifacts/${artifact.id}/zip`);
      const location = response.headers.get('location');
      if (response.status !== 302 || !location || new URL(location).protocol !== 'https:') throw new Error('배포 명세 다운로드 주소를 확인할 수 없습니다.');
      // Never forward the GitHub token to the artifact storage host.
      const zipResponse = await fetcher(location, { signal: AbortSignal.timeout(30000) });
      if (!zipResponse.ok) throw new Error('배포 명세를 내려받지 못했습니다.');
      const bytes = await readLimited(zipResponse, 1048576);
      const files = unzipSync(bytes, { filter: f => f.name === 'manifest.json' && f.originalSize <= 1048576 });
      if (!files['manifest.json']) throw new Error('배포 명세 manifest.json이 없습니다.');
      const state = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(files['manifest.json']));
      validateState(state);
      if (state.build?.identity !== publication.buildIdentity) throw new Error('빌드 명세와 실제 게시 실행이 일치하지 않습니다.');
      if (!publication.recovered && state.publication?.identity !== publication.identity) throw new Error('성공 명세와 실제 게시 실행이 일치하지 않습니다.');
      state.publication = { identity: publication.identity, requiresPublish: !publication.success, recovered: publication.recovered };
      return state;
    },
  };
}
