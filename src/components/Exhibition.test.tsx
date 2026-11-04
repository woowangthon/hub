import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { setMedia } from '../test/setup';
import { App } from '../App';
import axe from 'axe-core';
import { Exhibition } from './Exhibition';
import { testProjects } from '../test/projects';

function openGallery() {
  window.history.replaceState(null, '', '#exhibition');
  render(<App />);
  return screen.getByRole('searchbox', { name: '프로젝트명, 팀명, 기술명으로 검색' });
}

describe('전시회 미리보기', () => {
  it('빈 제출 목록에서도 예시 프로젝트를 끼워 넣거나 상세를 생성하지 않는다', () => {
    render(<Exhibition projects={[]} active reducedMotion />);
    expect(screen.getByText('0개 프로젝트')).toBeVisible();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('주입된 제출 자료를 목록과 공유 주소 상세에 일관되게 사용한다', () => {
    const project = { ...testProjects[0], id: 'submitted-project', title: '새 제출 프로젝트' };
    window.history.replaceState(null, '', '#exhibition/project/submitted-project');
    const view = render(<Exhibition projects={[project]} active reducedMotion />);
    expect(screen.getByRole('dialog', { name: project.title })).toBeVisible();
    expect(screen.queryByRole('heading', { name: testProjects[0].title })).not.toBeInTheDocument();

    // If the submission is removed, close its stale detail and recover the list.
    view.rerender(<Exhibition projects={[]} active reducedMotion />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('0개 프로젝트')).toBeVisible();
    expect(location.hash).toBe('#exhibition');
  });

  it('한글 조합 중에는 이전 결과를 유지하고 조합 종료 때 완성된 검색어를 적용한다', () => {
    const search = openGallery();
    fireEvent.compositionStart(search);
    fireEvent.change(search, { target: { value: 'ㅋ' } });
    expect(search).toHaveValue('ㅋ');
    expect(screen.getAllByRole('article')).toHaveLength(12);
    expect(screen.queryByText('검색 결과가 없습니다.')).not.toBeInTheDocument();
    // Some browsers commit the final value before their last input event.
    fireEvent.compositionEnd(search, { target: { value: '캠퍼스' } });
    expect(search).toHaveValue('캠퍼스');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getAllByRole('article')).toHaveLength(12);
  });

  it('카드의 보이는 텍스트를 읽기 이름에 보존하고 최상위 랜드마크를 제공한다', async () => {
    openGallery();
    expect(screen.getByRole('link', { name: '캠퍼스 길잡이 흩어진 학교 공지와 일정을 대화로 찾아주는 서비스입니다. 팀2 - 우왕팀 상세 보기' })).toBeVisible();
    expect(document.querySelector('.experience')).not.toHaveAttribute('aria-label');
    const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations).toEqual([]);
  });

  it('조합 종료 이벤트 없이 입력창을 떠나도 검색 상태가 고정되지 않는다', () => {
    const search = openGallery();
    fireEvent.compositionStart(search);
    fireEvent.change(search, { target: { value: '캠퍼스' } });
    fireEvent.blur(search);
    expect(screen.getAllByRole('article')).toHaveLength(1);
    fireEvent.change(search, { target: { value: '없는프로젝트' } });
    expect(screen.getByText('검색 결과가 없습니다.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '검색 초기화' }));
    expect(search).toHaveValue('');
    expect(screen.getAllByRole('article')).toHaveLength(12);
  });

  it('프로젝트명, 팀명, 기술명과 복수 검색어로 예시 프로젝트를 찾는다', () => {
    const search = openGallery();
    expect(screen.getAllByRole('article')).toHaveLength(12);
    for (const [query, title] of [['프로젝트12', '프로젝트12'], ['팀3', '프로젝트3'], ['  rEaCt   Spring  ', '캠퍼스 길잡이']]) {
      fireEvent.change(search, { target: { value: query } });
      const results = screen.getAllByRole('article');
      expect(results).toHaveLength(1);
      expect(within(results[0]).getByRole('heading', { name: title })).toBeInTheDocument();
    }
    fireEvent.keyDown(search, { key: 'Home' });
    expect(document.querySelector('.experience')).toHaveAttribute('data-scene', 'exhibition');
  });

  it('빈 검색 결과에서 초기화하면 전체 목록과 검색 초점을 복구한다', () => {
    const search = openGallery();
    fireEvent.change(search, { target: { value: '없는프로젝트' } });
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByText('검색 결과가 없습니다.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '검색 초기화' }));
    expect(search).toHaveValue('');
    expect(search).toHaveFocus();
    expect(screen.getAllByRole('article')).toHaveLength(12);
  });

  it('한 개의 활성 main과 푸터 링크, 프로젝트 주소를 가진 카드 링크를 제공한다', () => {
    openGallery();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('banner')).toBeVisible();
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: '우왕톤 GitHub 조직 (새 탭)' }))
      .toHaveAttribute('href', 'https://github.com/woowangthon');
    expect(within(footer).getByRole('link', { name: '운영 문의 이메일' }))
      .toHaveAttribute('href', 'mailto:chungbuk.univ@likelion.org');
    expect(document.querySelectorAll('.gallery-logo')).toHaveLength(1);
    for (const card of screen.getAllByRole('article')) expect(card).not.toHaveAttribute('tabindex');
  });

  it('맨 위로는 전시회 스크롤만 복귀시키고 제목에 초점을 두며 줄인 모션을 존중한다', () => {
    setMedia('(prefers-reduced-motion: reduce)', true);
    openGallery();
    const panel = document.getElementById('scene-exhibition')!;
    const scroll = vi.spyOn(panel, 'scrollTo');
    panel.scrollTop = 1600;
    fireEvent.click(screen.getByRole('button', { name: '맨 위로' }));
    expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
    expect(panel.scrollTop).toBe(0);
    expect(screen.getByRole('heading', { name: '전시회 월' })).toHaveFocus();
    expect(document.querySelector('.experience')).toHaveAttribute('data-scene', 'exhibition');
    fireEvent.keyDown(screen.getByRole('heading', { name: '전시회 월' }), { key: 'ArrowUp' });
    expect(screen.queryByRole('button', { name: '이전 장면' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '맨 위로' })).toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });
});
