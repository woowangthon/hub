import Ajv from 'ajv';
import sharp from 'sharp';
import schema from '../../schemas/archive.schema.json' with { type: 'json' };

export const branchPattern = /^W(?:0[1-9]|[1-9][0-9])$/;
export const branchFor = number => `W${String(number).padStart(2, '0')}`;
export const shaPattern = /^[a-f0-9]{40}$/;

function webUrl(value, httpsOnly = false) {
  if (value.trim() !== value || /[\s\\\u0000-\u001f]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return (httpsOnly ? url.protocol === 'https:' : ['http:', 'https:'].includes(url.protocol))
      && !url.username && !url.password && Boolean(url.hostname);
  } catch { return false; }
}
const ajv = new Ajv({ allErrors: true });
ajv.addFormat('web-url', value => webUrl(value));
ajv.addFormat('https-url', value => webUrl(value, true));
ajv.addFormat('repository', value => webUrl(value, true)
  && /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(value));
const validate = ajv.compile(schema);

export class SubmissionError extends Error {
  constructor(issues) {
    super('제출 자료 검증에 실패했습니다.');
    this.issues = issues;
  }
}
export function issue(branch, field, message) { return { branch, field, message }; }
export function fail(branch, field, message) { throw new SubmissionError([issue(branch, field, message)]); }
export function validateBranch(branch) {
  if (!branchPattern.test(branch)) fail(branch, 'branch', '브랜치 이름은 W01~W99 형식이어야 합니다. 예: W01, W32');
}
export function safeImagePath(value) {
  return typeof value === 'string' && value === value.trim()
    && !/[\\:%?#\u0000-\u001f\u007f]/u.test(value)
    && value.split('/').every(part => part && part !== '.' && part !== '..')
    && /\.(png|jpe?g|webp)$/i.test(value);
}
export function parseSubmission(buffer, branch, limit) {
  if (buffer.length > limit) fail(branch, 'archive/archive.json', `JSON은 ${limit}바이트 이하여야 합니다.`);
  let data;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)); }
  catch { fail(branch, 'archive/archive.json', 'UTF-8 JSON 문법을 확인해 주세요. 쉼표·따옴표·괄호가 올바르지 않습니다.'); }
  const issues = [];
  if (!validate(data)) {
    for (const error of validate.errors) {
      const field = `${error.instancePath}/${error.params.missingProperty ?? error.params.additionalProperty ?? ''}`.replace(/\/$/, '') || '/';
      const messages = {
        required: '필수 항목이 없습니다. 값을 입력해 주세요.',
        additionalProperties: '정의되지 않은 항목입니다. 필드 이름과 대소문자를 확인해 주세요.',
        type: `자료형이 올바르지 않습니다. ${error.params.type ?? ''} 형식으로 입력해 주세요.`,
        pattern: '공백만 입력할 수 없습니다. 내용을 입력해 주세요.',
        minItems: '최소 한 개의 항목을 입력해 주세요.',
        format: 'URL 형식이 올바르지 않습니다. 공개 주소와 허용 프로토콜을 확인해 주세요.',
      };
      issues.push(issue(branch, field, messages[error.keyword] ?? '제출 규격에 맞는 값을 입력해 주세요.'));
    }
  }
  if (data && typeof data === 'object') {
    if (data.teamNumber !== Number(branch.slice(1))) issues.push(issue(branch, '/teamNumber', `${branch}의 teamNumber는 숫자 ${Number(branch.slice(1))}이어야 합니다.`));
    const paths = [['/thumbnail', data.thumbnail], ...(Array.isArray(data.screenshots) ? data.screenshots.map((p, i) => [`/screenshots/${i}`, p]) : [])];
    for (const [field, path] of paths) {
      if (!safeImagePath(path)) issues.push(issue(branch, field, 'archive/ 내부의 PNG·JPEG·WebP 상대 경로를 입력해 주세요. 상위 경로·외부 주소는 허용하지 않습니다.'));
    }
  }
  if (issues.length) throw new SubmissionError(issues);
  return { ...data, demoUrl: data.demoUrl ?? '' };
}
export async function validateImage(buffer, path, branch, limits) {
  if (buffer.length > limits.imageBytes) fail(branch, path, `이미지는 ${limits.imageBytes / 1048576}MiB 이하여야 합니다.`);
  try {
    const image = sharp(buffer, { limitInputPixels: limits.imagePixels, failOn: 'warning' });
    const meta = await image.metadata();
    const extension = path.split('.').at(-1).toLowerCase().replace('jpg', 'jpeg');
    if (!['png', 'jpeg', 'webp'].includes(meta.format) || meta.format !== extension || (meta.pages ?? 1) !== 1) throw new Error('format');
    // Metadata alone does not detect truncated/corrupt pixel data.
    await image.raw().toBuffer();
  } catch {
    fail(branch, path, `이미지를 해독할 수 없습니다. 확장자와 실제 형식이 같은 정적 PNG·JPEG·WebP인지 확인해 주세요. 최대 ${limits.imagePixels / 1000000}MP입니다.`);
  }
}

const escapeCommand = value => String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
const escapeProperty = value => escapeCommand(value).replaceAll(':', '%3A').replaceAll(',', '%2C');
const escapeMarkdown = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('|', '&#124;').replace(/[\r\n]/g, ' ');
export function formatIssues(issues) {
  return {
    annotations: issues.map(i => `::error title=${escapeProperty(`${i.branch} · ${i.field}`)}::${escapeCommand(i.message)}`).join('\n'),
    summary: ['## 제출 검증 실패', '', '| 팀 | 항목 | 수정 방법 |', '|---|---|---|', ...issues.map(i => `| ${escapeMarkdown(i.branch)} | ${escapeMarkdown(i.field)} | ${escapeMarkdown(i.message)} |`), ''].join('\n'),
  };
}
