import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// React chooses its animation event name during module initialization. jsdom
// has CSS animation properties but no AnimationEvent constructor by default.
vi.hoisted(() => {
  Object.defineProperty(window, 'AnimationEvent', { configurable: true, value: class extends Event {
    animationName: string;
    constructor(type: string, init: AnimationEventInit = {}) {
      super(type, init);
      this.animationName = init.animationName ?? '';
    }
  } });
});

const media = new Map<string, { matches: boolean; listeners: Set<() => void> }>();
const observers = new Set<ResizeObserverCallback>();

export function setMedia(query: string, matches: boolean) {
  const item = media.get(query);
  if (item) { item.matches = matches; item.listeners.forEach((listener) => listener()); }
  else media.set(query, { matches, listeners: new Set() });
}

export function resizeViewport(height: number) {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => height });
  observers.forEach((callback) => callback([], {} as ResizeObserver));
}

beforeEach(() => {
  media.clear();
  observers.clear();
  window.history.replaceState(null, '', '/');
  sessionStorage.clear();
  document.documentElement.lang = 'ko';
  document.title = 'WOOWANGTHON';
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: (query: string) => {
    if (!media.has(query)) media.set(query, { matches: false, listeners: new Set() });
    const item = media.get(query)!;
    return {
      get matches() { return item.matches; }, media: query,
      addEventListener: (_: string, listener: () => void) => item.listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => item.listeners.delete(listener),
    };
  } });
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe() { observers.add(this.callback); }
    disconnect() { observers.delete(this.callback); }
    unobserve() { observers.delete(this.callback); }
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value(this: HTMLElement, options: ScrollToOptions) {
    this.scrollTop = options.top ?? this.scrollTop;
    this.dispatchEvent(new Event('scroll'));
  } });
  resizeViewport(844);
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
// App integration tests opt into fixtures here; production always uses the real data module.
vi.mock('virtual:archive-projects', async () => ({ projects: (await import('./projects')).testProjects }));
