import { readFile, writeFile } from 'node:fs/promises';
import { githubClient } from './github.mjs';
import { currentPublication, guardBaseline } from './publication.mjs';

// No dependency installation or participant code runs in the privileged deployment job.
try {
  const candidate = JSON.parse(await readFile('state/manifest.json', 'utf8'));
  const repository = process.env.GH_REPO;
  const current = await currentPublication(githubClient(repository, process.env.GH_TOKEN), repository);
  guardBaseline(candidate, current);
  const runId = Number(process.env.GITHUB_RUN_ID), attempt = Number(process.env.GITHUB_RUN_ATTEMPT);
  if (!Number.isSafeInteger(runId) || !Number.isSafeInteger(attempt) || runId < 1 || attempt < 1) throw new Error('실행 식별값이 없습니다.');
  candidate.publication = { identity: `${runId}:${attempt}:published`, runId, attempt };
  await writeFile('state/manifest.json', JSON.stringify(candidate, null, 2));
} catch (error) {
  console.error(`::error::${String(error.message).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
  process.exitCode = 1;
}
