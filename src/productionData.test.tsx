import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { App } from './App';

vi.unmock('virtual:archive-projects');

it('수집 전 화면에는 임시 카드나 샘플 작품을 넣지 않는다', () => {
  window.history.replaceState(null, '', '#exhibition');
  render(<App />);
  expect(screen.getByText('0개 프로젝트')).toBeVisible();
  expect(screen.getByText('등록된 프로젝트가 없습니다.')).toBeVisible();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '검색 초기화' })).not.toBeInTheDocument();
});
