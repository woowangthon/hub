// A tab-scoped record; reloads skip the introduction.
const visitKey = 'woowangthon-archive-intro-seen-v1';

export function hasSeenIntro() {
  try { return sessionStorage.getItem(visitKey) === '1'; }
  catch { return false; }
}

export function rememberIntro() {
  try { sessionStorage.setItem(visitKey, '1'); }
  catch { /* Navigation still works when persistence is blocked. */ }
}
