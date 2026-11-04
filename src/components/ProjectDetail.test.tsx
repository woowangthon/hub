import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { App } from '../App';
import { externalUrl, projectHash } from '../projectLocation';
import { ProjectDetail } from './ProjectDetail';
import { testProjects } from '../test/projects';

const card = () => screen.getByRole('link', { name: /^캠퍼스 길잡이 .* 상세 보기$/ });
function gallery() { window.history.replaceState(null, '', '#exhibition'); render(<App />); }

describe('프로젝트 상세', () => {
  it('복사 완료 안내는 잠시 후 사라지며 다시 복사하면 표시 시간이 갱신된다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ProjectDetail project={testProjects[0]} open onClose={vi.fn()} onRestore={vi.fn()} />);
    const copy = await screen.findByRole('button', { name: '프로젝트 주소 복사' });
    vi.useFakeTimers();
    await act(async () => { fireEvent.click(copy); });
    expect(screen.getByText('주소를 복사했습니다.')).toBeVisible();
    act(() => vi.advanceTimersByTime(3000));
    await act(async () => { fireEvent.click(copy); });
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText('주소를 복사했습니다.')).toBeVisible();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByText('주소를 복사했습니다.')).not.toBeInTheDocument();
  });

  it('복사 실패 시 직접 복사할 주소는 시간 제한 없이 유지된다', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    render(<ProjectDetail project={testProjects[0]} open onClose={vi.fn()} onRestore={vi.fn()} />);
    const copy = await screen.findByRole('button', { name: '프로젝트 주소 복사' });
    vi.useFakeTimers();
    await act(async () => { fireEvent.click(copy); });
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByRole('textbox', { name: '공유 주소' })).toHaveFocus();
    expect(screen.getByText('주소 복사에 실패했습니다.')).toBeVisible();
  });

  it('상세를 열면 배경 랜드마크와 상태를 숨기고 본문과 표의 탐색 이름을 제공한다', async () => {
    gallery(); fireEvent.click(card());
    const dialog = await screen.findByRole('dialog');
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(screen.queryByText('전체 프로젝트 12개', { selector: '[role=status]' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('region', { name: '캠퍼스 길잡이 상세 내용' })).toHaveAttribute('tabindex', '0');
    const table = within(dialog).getByRole('table', { name: '팀원 소개' });
    expect(within(table).getAllByRole('rowheader')).toHaveLength(testProjects[0].members.length);
    const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations).toEqual([]);
  });

  it('이전 프로젝트의 늦은 복사 결과가 새 프로젝트의 상태나 초점을 바꾸지 않는다', async () => {
    let rejectCopy: (reason: Error) => void = () => {};
    const pending = new Promise<void>((_, reject) => { rejectCopy = reject; });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => pending } });
    const props = { open: true, onClose: vi.fn(), onRestore: vi.fn() };
    const view = render(<ProjectDetail {...props} project={testProjects[0]} />);
    fireEvent.click(await screen.findByRole('button', { name: '프로젝트 주소 복사' }));
    view.rerender(<ProjectDetail {...props} project={testProjects[1]} />);
    await act(async () => { rejectCopy(new Error('denied')); });
    expect(screen.queryByRole('textbox', { name: '공유 주소' })).not.toBeInTheDocument();
    expect(screen.queryByText('주소 복사에 실패했습니다.')).not.toBeInTheDocument();
  });

  it('같은 탭에서 다른 공유 주소로 이동한 뒤 닫으면 예전 카드 대신 목록 맨 위로 복귀한다', async () => {
    gallery();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'React' } });
    document.getElementById('scene-exhibition')!.scrollTop = 456;
    fireEvent.click(card());
    await screen.findByRole('dialog', { name: '캠퍼스 길잡이' });
    act(() => {
      window.history.pushState(null, '', '#exhibition/project/project-2');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await screen.findByRole('dialog', { name: '프로젝트2' });
    expect(within(screen.getByRole('dialog')).getByRole('heading', { level: 2 })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: '프로젝트 상세 닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.getElementById('scene-exhibition')!.scrollTop).toBe(0);
    expect(screen.getByRole('heading', { name: '전시회 월' })).toHaveFocus();
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveValue(''));
    expect(screen.getAllByRole('article')).toHaveLength(12);
  });

  it('대표 이미지 로딩 실패와 빈 이미지는 같은 대체 이미지와 정확한 대체 텍스트를 쓴다', async () => {
    gallery(); fireEvent.click(card());
    const dialog = await screen.findByRole('dialog');
    const image = within(dialog).getByAltText('캠퍼스 길잡이 대표 이미지');
    fireEvent.error(image);
    expect(screen.getByAltText('캠퍼스 길잡이 대표 이미지 준비 중')).toHaveAttribute('src', expect.stringContaining('gallery-fallback.svg'));
  });

  it('닫기 입력이 연속되어도 목록을 지나 이전 페이지로 이동하지 않는다', async () => {
    gallery(); fireEvent.click(card());
    await screen.findByRole('dialog');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const close = screen.getByRole('button', { name: '프로젝트 상세 닫기' });
    fireEvent.click(close); fireEvent.click(close);
    expect(back).toHaveBeenCalledTimes(1);
  });
  it('카드에서 열고 뒤로/앞으로 이동해도 검색·목록 위치·초점을 복원한다', async () => {
    gallery();
    const search = screen.getByRole('searchbox');
    fireEvent.change(search, { target: { value: 'React' } });
    const panel = document.getElementById('scene-exhibition')!;
    panel.scrollTop = 456;
    const trigger = card();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: '캠퍼스 길잡이' });
    expect(window.location.hash).toBe(projectHash('project-1'));
    expect(within(dialog).getByRole('heading', { level: 2 })).toHaveFocus();
    expect(panel.style.overflow).toBe('hidden');
    expect(within(dialog).getByRole('table')).toHaveTextContent('사용자 흐름 설계와 공지 검색 화면 구현');
    await act(async () => window.history.back());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(panel.scrollTop).toBe(456);
    expect(search).toHaveValue('React');
    expect(panel.style.overflow).toBe('');
    await act(async () => window.history.forward());
    await screen.findByRole('dialog', { name: '캠퍼스 길잡이' });
    fireEvent.click(screen.getByRole('button', { name: '프로젝트 상세 닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(window.location.hash).toBe('#exhibition');
  });

  it('직접 공유 주소·StrictMode에서도 소개를 생략하고 닫으면 전체 목록 맨 위로 복귀한다', async () => {
    window.history.replaceState(null, '', '/archive/?source=share#exhibition/project/project-1');
    render(<StrictMode><App /></StrictMode>);
    await screen.findByRole('dialog', { name: '캠퍼스 길잡이' });
    expect(document.querySelector('.experience')).toHaveAttribute('data-scene', 'exhibition');
    expect(window.location.hash).toBe(projectHash('project-1'));
    expect(screen.queryByRole('heading', { name: 'AI 우왕톤' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '프로젝트 상세 닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(window.location.pathname).toBe('/archive/');
    expect(document.getElementById('scene-exhibition')?.scrollTop).toBe(0);
    expect(screen.getByRole('heading', { name: '전시회 월' })).toHaveFocus();
  });

  it('현재 프로젝트 주소를 복사하며 클립보드 실패 시 선택 가능한 주소를 제공한다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    gallery(); fireEvent.click(card());
    fireEvent.click(await screen.findByRole('button', { name: '프로젝트 주소 복사' }));
    await screen.findByText('주소를 복사했습니다.');
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/#exhibition/project/project-1`);
    writeText.mockRejectedValueOnce(new Error('denied'));
    fireEvent.click(screen.getByRole('button', { name: '프로젝트 주소 복사' }));
    expect(await screen.findByRole('textbox', { name: '공유 주소' })).toHaveFocus();
  });

  it('모달 구조의 접근성, 선택 링크·이미지 실패 상태를 처리한다', async () => {
    gallery(); fireEvent.click(card());
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: /서비스 열기/ })).toHaveAttribute('href', 'https://example.com/');
    fireEvent.error(within(dialog).getByAltText('캠퍼스 길잡이 추가 화면 1'));
    expect(within(dialog).getByText('이미지를 불러오지 못했습니다.')).toBeVisible();
    const result = await axe.run(dialog, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations).toEqual([]);
  });

  it('없는 주소는 목록으로 복구하고 빈/위험한 외부 주소는 링크로 만들지 않는다', async () => {
    window.history.replaceState(null, '', '#exhibition/project/%E0%A4%A');
    render(<App />);
    await waitFor(() => expect(window.location.hash).toBe('#exhibition'));
    await waitFor(() => expect(screen.getByRole('heading', { name: '전시회 월' })).toHaveFocus());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelector('.experience')).toHaveAttribute('data-scene', 'exhibition');
    expect(externalUrl('javascript:alert(1)')).toBeUndefined();
    for (const unsafe of ['data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', 'https://user:secret@example.com', 'https://github.com@evil.example']) expect(externalUrl(unsafe)).toBeUndefined();
    expect(externalUrl('')).toBeUndefined();
    expect(externalUrl('https://example.com')).toBe('https://example.com/');
    fireEvent.click(screen.getByRole('link', { name: /^프로젝트2 .* 상세 보기$/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('link', { name: /서비스 열기/ })).not.toBeInTheDocument();
  });
});
