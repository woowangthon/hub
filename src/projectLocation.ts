const detailPrefix = '#exhibition/project/';
export const isProjectLocation = (hash: string) => hash.startsWith(detailPrefix);
export const projectHash = (id: string) => `${detailPrefix}${encodeURIComponent(id)}`;
export function projectIdFromHash(hash: string): string | undefined {
  if (!isProjectLocation(hash)) return;
  try { return decodeURIComponent(hash.slice(detailPrefix.length)); } catch { return; }
}
export function projectUrl(id: string) {
  const url = new URL(window.location.href);
  url.hash = projectHash(id);
  return url.href;
}
export function externalUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return; }
}
