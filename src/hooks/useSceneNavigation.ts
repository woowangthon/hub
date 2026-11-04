import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { sceneIds } from '../content';
import { hasSeenIntro, rememberIntro } from '../introVisit';
import { isProjectLocation } from '../projectLocation';

function initialScene() {
  if (isProjectLocation(window.location.hash)) return 3;
  const index = sceneIds.findIndex((id) => `#${id}` === window.location.hash);
  return Math.max(0, index);
}

export function useSceneNavigation(reducedMotion: boolean) {
  const [active, setActive] = useState(() => hasSeenIntro() ? 3 : initialScene());
  const [transitioning, setTransitioning] = useState(false);
  const transitionRef = useRef(false);
  const reducedRef = useRef(reducedMotion);
  const wheelBlockedUntil = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  const focusFrame = useRef<number | undefined>(undefined);

  const select = useCallback((next: number) => {
    const index = Math.max(0, Math.min(sceneIds.length - 1, next));
    if (index === activeRef.current) return;
    // Never leave focus inside a panel that is about to become hidden.
    const oldPanel = document.getElementById(`scene-${sceneIds[activeRef.current]}`);
    if (oldPanel?.contains(document.activeElement)) scrollRef.current?.focus({ preventScroll: true });
    activeRef.current = index;
    setActive(index);
  }, []);

  const focusGallery = useCallback(() => {
    focusFrame.current = requestAnimationFrame(() => {
      document.getElementById('exhibition')?.focus({ preventScroll: true });
      focusFrame.current = undefined;
    });
  }, []);

  const finishEntry = useCallback(() => {
    if (!transitionRef.current) return;
    transitionRef.current = false;
    select(3);
    setTransitioning(false);
    const scroller = scrollRef.current;
    scroller?.scrollTo({ top: scroller.clientHeight * 3, behavior: 'instant' });
    window.history.replaceState(null, '', '#exhibition');
    wheelBlockedUntil.current = performance.now() + 180;
    focusGallery();
  }, [select, focusGallery]);

  const goTo = useCallback((next: number, focusHeading = false, immediate = false) => {
    if (transitionRef.current) return;
    const index = activeRef.current === 3 ? 3 : Math.max(0, Math.min(sceneIds.length - 1, next));
    if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current);
    if (index === 3 && activeRef.current === 2 && !reducedRef.current && !immediate) {
      scrollRef.current?.focus({ preventScroll: true });
      document.getElementById('scene-exhibition')?.scrollTo({ top: 0, behavior: 'instant' });
      transitionRef.current = true;
      setTransitioning(true);
      const scroller = scrollRef.current;
      scroller?.scrollTo({ top: scroller.clientHeight * 2, behavior: 'instant' });
      return;
    }
    if (index === 3 && activeRef.current !== 3) scrollRef.current?.focus({ preventScroll: true });
    select(index);
    const scroller = scrollRef.current;
    if (scroller) scroller.scrollTo({ top: scroller.clientHeight * index, behavior: 'instant' });
    // Native hash entry and Back/Forward remain usable without making every wheel
    // gesture a new history entry or asking the browser to scroll a hidden heading.
    if (!(index === 3 && isProjectLocation(window.location.hash))) window.history.replaceState(null, '', `#${sceneIds[index]}`);
    if (index === 3 && focusHeading) focusGallery();
    else if (focusHeading) focusFrame.current = requestAnimationFrame(() => {
      document.getElementById(sceneIds[index])?.focus({ preventScroll: true });
      focusFrame.current = undefined;
    });
  }, [select, focusGallery]);

  useLayoutEffect(() => {
    // Write only after the initial state has been chosen: StrictMode may call
    // the state initializer twice before the first commit.
    rememberIntro();
    if (activeRef.current === 3 && !isProjectLocation(window.location.hash)) {
      window.history.replaceState(null, '', '#exhibition');
      focusGallery();
    }
  }, [focusGallery]);

  useLayoutEffect(() => {
    reducedRef.current = reducedMotion;
    if (reducedMotion) finishEntry();
  }, [reducedMotion, finishEntry]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    let alignedHeight = scroller.clientHeight;
    const align = () => {
      alignedHeight = scroller.clientHeight;
      scroller.scrollTo({ top: activeRef.current * alignedHeight, behavior: 'instant' });
    };
    const onScroll = () => {
      // Resize can emit a scroll before ResizeObserver; preserve the selected scene.
      if (scroller.clientHeight !== alignedHeight) { align(); return; }
      if (transitionRef.current || activeRef.current === 3) {
        if (scroller.scrollTop !== activeRef.current * alignedHeight) align();
        return;
      }
      if (scroller.clientHeight) {
        const index = Math.round(scroller.scrollTop / scroller.clientHeight);
        if (index === 3) goTo(3, true);
        else select(index);
      }
    };
    const onHash = () => {
      if (isProjectLocation(window.location.hash)) {
        if (activeRef.current !== 3) goTo(3, false, true);
        return;
      }
      // Detail navigation owns focus restoration when returning to this list.
      if (activeRef.current === 3 && window.location.hash === '#exhibition') return;
      if (transitionRef.current) {
        window.history.replaceState(null, '', '#exhibition');
        return;
      }
      goTo(initialScene(), true, true);
    };
    const atBottom = () => {
      const panel = document.getElementById('scene-statistics');
      return !panel || panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1;
    };
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return; // Preserve browser pinch-to-zoom.
      if (transitionRef.current) { event.preventDefault(); return; }
      if (activeRef.current === 3 && performance.now() < wheelBlockedUntil.current) {
        event.preventDefault();
        wheelBlockedUntil.current = performance.now() + 100;
        return;
      }
      if (activeRef.current === 2 && event.deltaY > 0 && atBottom()) {
        event.preventDefault(); goTo(3, true);
      }
    };
    let touchY = 0;
    let entryTouch = false;
    const onTouchStart = (event: TouchEvent) => {
      touchY = event.touches[0]?.clientY ?? 0;
      entryTouch = false;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      if (transitionRef.current || entryTouch) { event.preventDefault(); return; }
      if (activeRef.current === 2 && touchY - event.touches[0].clientY > 12 && atBottom()) {
        event.preventDefault(); entryTouch = true; goTo(3, true);
      }
    };
    align();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    scroller.addEventListener('wheel', onWheel, { passive: false });
    scroller.addEventListener('touchstart', onTouchStart, { passive: true });
    scroller.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('hashchange', onHash);
    const observer = new ResizeObserver(align);
    observer.observe(scroller);
    return () => {
      if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current);
      observer.disconnect();
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('wheel', onWheel);
      scroller.removeEventListener('touchstart', onTouchStart);
      scroller.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('hashchange', onHash);
    };
  }, [goTo, select]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    // Leave buttons, links, inputs and future project interactions their native keys.
    if (target.closest('button, a, input, select, textarea, [contenteditable="true"]')) return;
    if (transitionRef.current) {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) event.preventDefault();
      return;
    }
    // The gallery owns native document keys and scrolling, including Home/Up.
    if (activeRef.current === 3) return;
    const keys: Record<string, number> = {
      ArrowDown: active + 1, PageDown: active + 1,
      ArrowUp: active - 1, PageUp: active - 1,
      Home: 0, End: sceneIds.length - 1,
    };
    if (!(event.key in keys)) return;
    const panel = document.getElementById(`scene-${sceneIds[active]}`);
    // In a short window, first let the browser scroll the scene's own content.
    if (panel && panel.scrollHeight > panel.clientHeight + 1 && !['Home', 'End'].includes(event.key)) {
      const down = keys[event.key] > active;
      if ((down && panel.scrollTop + panel.clientHeight < panel.scrollHeight - 1) || (!down && panel.scrollTop > 0)) {
        event.preventDefault();
        const distance = event.key.startsWith('Page') ? panel.clientHeight * .85 : 48;
        panel.scrollTo({ top: panel.scrollTop + (down ? distance : -distance), behavior: 'instant' });
        return;
      }
    }
    event.preventDefault();
    goTo(keys[event.key], true);
  };

  return { active, transitioning, finishEntry, scrollRef, goTo, onKeyDown };
}
