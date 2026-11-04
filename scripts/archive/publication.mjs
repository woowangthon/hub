// These names are an audit contract: changing the workflow step requires a history migration.
export const publishStepName = '사이트 게시';
const paths = ['.github/workflows/archive-auto.yml', '.github/workflows/archive-full.yml'];
const date = value => {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new Error('배포 이력의 시각을 확인할 수 없습니다.');
  return result;
};

export async function currentPublication(api, repository) {
  const runs = (await api.list('/actions/runs?branch=main', 'workflow_runs')).filter(run =>
    ['schedule', 'workflow_dispatch'].includes(run.event) && run.head_branch === 'main'
    && paths.includes(run.path?.split('@')[0]) && run.head_repository?.full_name === repository);
  runs.sort((a, b) => date(b.updated_at) - date(a.updated_at));
  let latest = null;
  for (const run of runs) {
    if (latest && date(run.updated_at) < latest.time) break;
    if (!Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1 || run.run_attempt > 100) throw new Error('워크플로 재실행 이력을 확인할 수 없습니다.');
    for (let attempt = run.run_attempt; attempt >= 1; attempt--) {
      const jobs = await api.list(`/actions/runs/${run.id}/attempts/${attempt}/jobs`, 'jobs');
      for (const job of jobs) {
        const step = job.steps?.find(s => s.name === publishStepName);
        if (!step || !step.started_at || step.conclusion === 'skipped') continue;
        const event = { runId: run.id, attempt, identity: `${run.id}:${attempt}`,
          time: date(step.completed_at ?? step.started_at), success: step.conclusion === 'success' };
        const build = job.name?.match(/\(build (\d+):(\d+)\)$/);
        if (!build || Number(build[1]) !== run.id) throw new Error('게시 실행의 빌드 식별값이 없습니다. 이전 워크플로 이력을 복구해 주세요.');
        event.buildIdentity = `${build[1]}:${build[2]}`;
        event.candidateName = `archive-candidate-state-${build[1]}-${build[2]}`;
        if (!latest || event.time > latest.time) latest = event;
      }
    }
  }

  // Detect deployments outside the audited workflows. An environment job's failure alone
  // does not prove Pages failed: its marker upload may have failed AFTER publication.
  const deployments = await api.list('/deployments?environment=github-pages');
  for (const deployment of deployments) {
    if (latest && date(deployment.created_at) <= latest.time) continue;
    const statuses = await api.json(`/deployments/${deployment.id}/statuses?per_page=100`);
    const known = statuses.some(status => {
      try {
        const url = new URL(status.log_url);
        const match = url.pathname.match(/^\/([^/]+\/[^/]+)\/actions\/runs\/(\d+)(?:\/|$)/);
        return url.origin === 'https://github.com' && match?.[1] === repository && runs.some(r => String(r.id) === match[2]);
      } catch { return false; }
    });
    if (!known) throw new Error('검증된 워크플로와 연결할 수 없는 Pages 배포 이력이 있습니다. 실제 게시 상태를 먼저 확인해 주세요.');
  }
  if (!latest) return null; // Includes a first attempt that stopped before entering the Pages step.
  async function find(name) {
    const result = await api.json(`/actions/artifacts?name=${name}&per_page=100`);
    return result.artifacts.find(a => a.name === name && a.workflow_run?.id === latest.runId && a.workflow_run?.head_branch === 'main');
  }
  let artifact = latest.success ? await find(`archive-published-state-${latest.runId}-${latest.attempt}`) : null;
  const recovered = !artifact;
  if (!artifact) artifact = await find(latest.candidateName);
  if (!artifact) throw new Error('최근 게시 시도의 성공 명세와 고정된 빌드 명세가 없습니다. 이전 명세로 진행하지 않고 복구를 기다립니다.');
  if (artifact.expired) throw new Error('마지막 배포 명세가 만료되었습니다. 보관한 성공 명세로 복구한 뒤 다시 실행해 주세요.');
  if (artifact.size_in_bytes > 1048576) throw new Error('배포 명세 artifact 크기가 비정상입니다.');
  // A failed polling step can still have published. Its validated candidate is the
  // conservative baseline: protect its teams and force publication, never skip it.
  return { ...latest, identity: `${latest.identity}:${latest.success ? 'published' : 'uncertain'}`, recovered, artifact };
}

export function guardBaseline(candidate, publication) {
  if (!Object.hasOwn(candidate, 'baselinePublication')) throw new Error('이 후보에는 배포 기준 정보가 없습니다. 전체 워크플로를 새로 실행해 주세요.');
  if (publication && !publication.success && candidate.build?.identity === publication.buildIdentity) return;
  if (candidate.baselinePublication !== (publication?.identity ?? null)) {
    throw new Error('빌드 이후 다른 배포가 반영되었습니다. 오래된 후보의 게시를 중단합니다. 전체 워크플로를 새로 실행해 주세요.');
  }
}
