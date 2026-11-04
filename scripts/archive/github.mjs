export async function readLimited(response, max) {
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > max) throw new Error('다운로드 크기 제한을 초과했습니다.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function githubClient(repository, token, fetcher = fetch) {
  if (!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) throw new Error('GH_REPO에 owner/repository를 지정해 주세요.');
  const prefix = `https://api.github.com/repos/${repository}`;
  async function request(path, optional404 = false) {
    const response = await fetcher(`${prefix}${path}`, {
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(30000), redirect: 'manual',
    });
    if (optional404 && response.status === 404) return null;
    if (!response.ok && response.status !== 302) throw new Error(`GitHub 조회 실패 (${response.status}). 권한·요청 제한·네트워크 상태를 확인해 주세요.`);
    return response;
  }
  async function json(path, optional = false) {
    const response = await request(path, optional);
    if (!response) return null;
    if (!response.ok) throw new Error('GitHub JSON 조회가 예기치 않은 주소로 이동했습니다.');
    return JSON.parse((await readLimited(response, 32 * 1048576)).toString('utf8'));
  }
  async function list(path, key) {
    const items = [];
    for (let page = 1; page <= 10; page++) {
      const result = await json(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      const batch = key ? result[key] : result;
      if (!Array.isArray(batch)) throw new Error('GitHub 목록 응답 형식이 올바르지 않습니다.');
      items.push(...batch);
      if (batch.length < 100) return items;
    }
    throw new Error('배포 이력 조회 한도를 초과했습니다. 이력을 확인한 뒤 운영진이 복구해야 합니다.');
  }
  return { request, json, list };
}
