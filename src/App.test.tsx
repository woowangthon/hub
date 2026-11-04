import { StrictMode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { App } from './App';
import { resizeViewport, setMedia } from './test/setup';

const main = () => document.querySelector<HTMLElement>('.experience')!;
const next = () => fireEvent.click(screen.getByRole('button', { name: '다음 장면' }));
const finishEntry = () => {
  const event = new Event('animationend', { bubbles: true });
  Object.defineProperty(event, 'animationName', { value: 'gallery-enter' });
  fireEvent(document.getElementById('scene-exhibition')!, event);
};

describe('스플래시 사용자 흐름', () => {
  it('기관 이름과 순서를 노출하고 참가 현황을 의미 있는 용어/값으로 제공한다', () => {
    render(<StrictMode><App /></StrictMode>);
    expect(screen.getByRole('heading', { level: 1, name: 'AI 우왕톤' })).toBeVisible();
    next();
    const hosts = screen.getByRole('region', { name: /^주관$/ });
    expect(within(hosts).getAllByRole('img').map((img) => img.getAttribute('alt'))).toEqual([
      '교육부', '한국산업기술진흥원(KIAT)', 'AI부트캠프사업단',
    ]);
    expect(screen.queryByRole('heading', { name: /^AI 우왕톤$/ })).not.toBeInTheDocument();
    next();
    expect(screen.getAllByRole('term').map((term) => term.textContent)).toEqual(['참가자', '참가 팀', '프로젝트']);
    expect(screen.getAllByRole('definition').map((value) => value.textContent)).toEqual(['131명', '51팀', '12개']);
  });

  it('키보드로 마지막 장면까지 이동하며 경계에서 순환하지 않는다', () => {
    render(<App />);
    main().focus();
    fireEvent.keyDown(main(), { key: 'ArrowDown' });
    expect(main()).toHaveAttribute('data-scene', 'organizations');
    fireEvent.keyDown(main(), { key: 'End' });
    fireEvent.keyDown(main(), { key: 'ArrowDown' });
    expect(main()).toHaveAttribute('data-scene', 'exhibition');
    fireEvent.keyDown(main(), { key: 'ArrowUp' });
    expect(main()).toHaveAttribute('data-scene', 'exhibition');
    fireEvent.keyDown(main(), { key: 'Home' });
    fireEvent.keyDown(main(), { key: 'ArrowUp' });
    expect(main()).toHaveAttribute('data-scene', 'exhibition');
    expect(document.querySelector('.wheel')).not.toHaveClass('is-entering');
  });

  it('스크롤 이동과 창 크기 변경 뒤 현재 장면을 유지한다', () => {
    render(<App />);
    act(() => main().scrollTo({ top: 844 * 2 }));
    expect(main()).toHaveAttribute('data-scene', 'statistics');
    act(() => resizeViewport(600));
    expect(main().scrollTop).toBe(1200);
    expect(main()).toHaveAttribute('data-scene', 'statistics');
  });

  it('전시회 바로가기는 모션 없이 제목에 초점을 두며 소개로 돌아가지 않는다', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('link', { name: '전시회로 바로가기' }));
    const heading = screen.getByRole('heading', { name: '전시회 월' });
    await vi.waitFor(() => expect(heading).toHaveFocus());
    fireEvent.keyDown(heading, { key: 'ArrowUp' });
    expect(heading).toHaveFocus();
    expect(main()).toHaveAttribute('data-scene', 'exhibition');
    expect(screen.queryByRole('navigation', { name: '장면 이동' })).not.toBeInTheDocument();
  });

  it('크기 변경 중 scroll이 ResizeObserver보다 먼저 와도 전시회를 유지한다', () => {
    window.history.replaceState(null, '', '#exhibition');
    render(<App />);
    Object.defineProperty(main(), 'clientHeight', { configurable: true, value: 600 });
    main().scrollTop = 1200;
    fireEvent.scroll(main());
    expect(main()).toHaveAttribute('data-scene', 'exhibition');
    expect(main().scrollTop).toBe(1800);
  });

  it('처음부터 줄인 모션 및 실행 중 설정 변경을 반영한다', () => {
    setMedia('(prefers-reduced-motion: reduce)', true);
    render(<App />);
    expect(main()).toHaveAttribute('data-reduced-motion', 'true');
    expect(document.querySelector('.wheel')).not.toHaveClass('is-entering');
    act(() => setMedia('(prefers-reduced-motion: reduce)', false));
    next(); next(); next();
    expect(main()).toHaveAttribute('data-transitioning', 'true');
    act(() => setMedia('(prefers-reduced-motion: reduce)', true));
    expect(main()).toHaveAttribute('data-scene', 'exhibition');
    expect(main()).toHaveAttribute('data-transitioning', 'false');
    expect(document.querySelector('.wheel')).not.toHaveClass('is-entering');
  });

  it('직접 링크로 전시회에 진입하며 숨겨진 장면에 초점을 남기지 않는다', async () => {
    window.history.replaceState(null, '', '#exhibition');
    render(<App />);
    expect(main()).toHaveAttribute('data-scene', 'exhibition');
    expect(main().scrollTop).toBe(844 * 3);
    expect(document.querySelector('.wheel')).not.toHaveClass('is-entering');
    await vi.waitFor(() => expect(screen.getByRole('heading', { name: '전시회 월' })).toHaveFocus());
  });

  it('버튼과 수정키에 대한 기본 키 동작을 가로채지 않는다', () => {
    render(<App />);
    fireEvent.keyDown(main(), { key: 'End', ctrlKey: true });
    expect(main()).toHaveAttribute('data-scene', 'intro');
    fireEvent.keyDown(screen.getByRole('button', { name: '다음 장면' }), { key: 'ArrowDown' });
    expect(main()).toHaveAttribute('data-scene', 'intro');
  });

  it('낮은 창에서는 내용부터 스크롤하고 끝에서 다음 장면으로 이동한다', () => {
    render(<App />);
    next();
    const panel = document.getElementById('scene-organizations')!;
    Object.defineProperty(panel, 'clientHeight', { configurable: true, value: 200 });
    Object.defineProperty(panel, 'scrollHeight', { configurable: true, value: 400 });
    fireEvent.keyDown(main(), { key: 'ArrowDown' });
    expect(panel.scrollTop).toBe(48);
    expect(main()).toHaveAttribute('data-scene', 'organizations');
    panel.scrollTop = 200;
    fireEvent.keyDown(main(), { key: 'ArrowDown' });
    expect(main()).toHaveAttribute('data-scene', 'statistics');
  });

  it('네 장면의 자동 검사에서 WCAG A/AA 구조 위반이 없다', async () => {
    render(<App />);
    for (let index = 0; index < 4; index++) {
      const result = await axe.run(document.body, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
        // jsdom has no layout/color engine; palette contrast is recorded separately.
        rules: { 'color-contrast': { enabled: false } },
      });
      expect(result.violations.map((v) => `${v.id}: ${v.description}`)).toEqual([]);
      if (index < 3) { next(); if (index === 2) finishEntry(); }
    }
  });

  it('소개를 처음 표시한 탭에서는 다시 마운트해도 소개를 생략한다', () => {
    const first = render(<StrictMode><App /></StrictMode>);
    expect(main()).toHaveAttribute('data-scene', 'intro');
    first.unmount();
    window.history.replaceState(null, '', '#intro');
    render(<StrictMode><App /></StrictMode>);
    expect(main()).toHaveAttribute('data-scene', 'exhibition');
    expect(location.hash).toBe('#exhibition');
    expect(main()).toHaveAttribute('data-transitioning', 'false');
  });

  it('B 전환 중 중복·반대 입력을 잠그고 완료 시 전시회 제목으로 초점을 넘긴다', async () => {
    render(<App />);
    next(); next(); next();
    expect(main()).toHaveAttribute('data-transitioning', 'true');
    const gallery = document.getElementById('scene-exhibition')!;
    expect(gallery).not.toHaveAttribute('hidden');
    expect(gallery).toHaveAttribute('inert');
    expect(document.querySelector('.splash-surface')).toHaveAttribute('inert');
    fireEvent.keyDown(main(), { key: 'ArrowUp' });
    fireEvent.wheel(main(), { deltaY: -100 });
    fireEvent.wheel(main(), { deltaY: 100 });
    expect(main()).toHaveAttribute('data-scene', 'statistics');
    finishEntry();
    expect(main()).toHaveAttribute('data-scene', 'exhibition');
    expect(gallery).not.toHaveAttribute('inert');
    await vi.waitFor(() => expect(screen.getByRole('heading', { name: '전시회 월' })).toHaveFocus());
    window.history.replaceState(null, '', '#intro');
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(main()).toHaveAttribute('data-scene', 'exhibition');
    expect(location.hash).toBe('#exhibition');
  });

  it('참가 현황의 끝에서 휠로 진입하고 잔여 휠을 잠깐 흡수한다', () => {
    render(<App />);
    next(); next();
    fireEvent.wheel(main(), { deltaY: 80 });
    expect(main()).toHaveAttribute('data-transitioning', 'true');
    finishEntry();
    expect(fireEvent.wheel(main(), { deltaY: 15 })).toBe(false);
    expect(main()).toHaveAttribute('data-scene', 'exhibition');
  });

  it('터치 위로 밀기는 소개 마지막 경계에서 B 전환을 시작한다', () => {
    render(<App />);
    next(); next();
    fireEvent.touchStart(main(), { touches: [{ clientY: 500 }] });
    fireEvent.touchMove(main(), { touches: [{ clientY: 450 }] });
    expect(main()).toHaveAttribute('data-transitioning', 'true');
    finishEntry();
    fireEvent.touchMove(main(), { touches: [{ clientY: 400 }] });
    expect(main()).toHaveAttribute('data-scene', 'exhibition');
  });

  it('저장소 접근이 차단되어도 소개와 단방향 진입은 동작한다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    render(<StrictMode><App /></StrictMode>);
    next(); next(); next(); finishEntry();
    fireEvent.keyDown(main(), { key: 'Home' });
    expect(main()).toHaveAttribute('data-scene', 'exhibition');
  });

  it('축소 모션에서는 참가 현황에서 즉시 전시회에 도착한다', () => {
    setMedia('(prefers-reduced-motion: reduce)', true);
    render(<App />);
    next(); next(); next();
    expect(main()).toHaveAttribute('data-transitioning', 'false');
    expect(main()).toHaveAttribute('data-scene', 'exhibition');
  });

  it('B 전환 중 크기가 바뀌어도 통계 화면을 유지한 뒤 새 높이의 전시회에 도착한다', () => {
    render(<App />);
    next(); next(); next();
    act(() => resizeViewport(600));
    expect(main().scrollTop).toBe(1200);
    expect(main()).toHaveAttribute('data-transitioning', 'true');
    finishEntry();
    expect(main().scrollTop).toBe(1800);
    expect(main()).toHaveAttribute('data-scene', 'exhibition');
  });
});
