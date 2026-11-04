import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const html = readFileSync(resolve('index.html'), 'utf8');

describe('static startup fallback', () => {
  it('hides fallback copy before the app module starts, without relying on bundled CSS', () => {
    const dom = new JSDOM(html, { runScripts: 'dangerously' });
    const { document } = dom.window;
    expect(document.documentElement.dataset.appState).toBe('loading');
    expect(dom.window.getComputedStyle(document.getElementById('startup')!).display).toBe('none');
    expect(document.getElementById('root')!.children).toHaveLength(0);
    expect(document.title).toBe('WOOWANGTHON');
    dom.window.close();
  });

  it('keeps readable event information and recovery links when JavaScript is disabled', () => {
    const dom = new JSDOM(html);
    const { document } = dom.window;
    expect(dom.window.getComputedStyle(document.getElementById('startup')!).display).not.toBe('none');
    expect(dom.window.getComputedStyle(document.getElementById('root')!).display).toBe('none');
    expect(document.querySelector('#startup h1')?.textContent).toBe('AI 우왕톤');
    expect(document.querySelector('#startup a[href=""]')?.textContent).toBe('새로고침');
    expect(document.querySelectorAll('#exhibition')).toHaveLength(0);
    dom.window.close();
  });

  it('reveals fallback on module failure but ignores unrelated image errors after mounting', () => {
    const dom = new JSDOM(html, { runScripts: 'dangerously' });
    const { document } = dom.window;
    document.documentElement.dataset.appState = 'ready';
    const image = document.createElement('img');
    document.body.append(image);
    image.dispatchEvent(new dom.window.Event('error'));
    expect(document.documentElement.dataset.appState).toBe('ready');
    document.querySelector('script[type="module"]')!.dispatchEvent(new dom.window.Event('error'));
    expect(document.documentElement.dataset.appState).toBe('failed');
    expect(dom.window.getComputedStyle(document.getElementById('startup')!).display).not.toBe('none');
    expect(dom.window.getComputedStyle(document.getElementById('root')!).display).toBe('none');
    dom.window.close();
  });
});
