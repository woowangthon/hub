import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project } from '../project';
import { isProjectLocation, projectHash, projectIdFromHash } from '../projectLocation';

function currentProject(projects: readonly Project[]) {
  const id = projectIdFromHash(window.location.hash);
  return projects.find(project => project.id === id);
}
type DetailState =
  | { isOpen: true; project: Project }
  | { isOpen: false; project?: Project };

export function useProjectNavigation(projects: readonly Project[]) {
  const [detail, setDetail] = useState<DetailState>(() => {
    const project = currentProject(projects);
    return project ? { isOpen: true, project } : { isOpen: false };
  });
  const updateProject = useCallback((project: Project | undefined) => {
    // Retain content while the dialog closes, without mutating refs in render.
    setDetail(previous => {
      if (project) return previous.isOpen && previous.project === project ? previous : { isOpen: true, project };
      return previous.isOpen ? { isOpen: false, project: previous.project } : previous;
    });
  }, []);
  const origin = useRef<{ trigger: HTMLAnchorElement; scrollTop: number; key: string } | undefined>(undefined);
  const closing = useRef(false);
  useEffect(() => {
    let invalidFocus: number | undefined;
    const sync = () => {
      if (invalidFocus !== undefined) cancelAnimationFrame(invalidFocus);
      closing.current = false;
      const next = currentProject(projects);
      // A manually entered/shared project address has no list origin, even if
      // a different project was previously opened from this mounted list.
      if (next && window.history.state?.archiveDetail !== origin.current?.key) origin.current = undefined;
      if (!next && isProjectLocation(window.location.hash)) {
        origin.current = undefined;
        window.history.replaceState(null, '', '#exhibition');
        invalidFocus = requestAnimationFrame(() => {
          document.getElementById('scene-exhibition')?.scrollTo({ top: 0, behavior: 'instant' });
          document.getElementById('exhibition')?.focus({ preventScroll: true });
        });
      }
      updateProject(next);
    };
    sync();
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      if (invalidFocus !== undefined) cancelAnimationFrame(invalidFocus);
      window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync);
    };
  }, [projects, updateProject]);
  const open = (id: string, trigger: HTMLAnchorElement) => {
    const next = projects.find(item => item.id === id);
    if (!next) return;
    const key = crypto.randomUUID();
    origin.current = { trigger, scrollTop: document.getElementById('scene-exhibition')?.scrollTop ?? 0, key };
    window.history.pushState({ archiveDetail: key }, '', projectHash(id));
    updateProject(next);
  };
  const close = () => {
    // A history traversal completes asynchronously; repeated Escape/clicks must
    // not traverse past the list while the first close is still pending.
    if (closing.current) return;
    closing.current = true;
    if (origin.current && window.history.state?.archiveDetail === origin.current.key) window.history.back();
    else { window.history.replaceState(null, '', '#exhibition'); updateProject(undefined); closing.current = false; }
  };
  const restoreList = useCallback(() => {
    const scroller = document.getElementById('scene-exhibition');
    const target = origin.current?.trigger;
    if (target?.isConnected) {
      scroller?.scrollTo({ top: origin.current?.scrollTop ?? 0, behavior: 'instant' });
      target.focus({ preventScroll: true });
      return true;
    } else {
      scroller?.scrollTo({ top: 0, behavior: 'instant' });
      document.getElementById('exhibition')?.focus({ preventScroll: true });
      return false;
    }
  }, []);
  return { ...detail, open, close, restoreList };
}
