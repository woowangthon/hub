import education from './assets/education.svg';
import kiat from './assets/kiat.png';
import bootcamp from './assets/bootcamp.svg';
import likelion from './assets/likelion.svg';
import notion from './assets/notion.png';

export const organizations = [
  { role: '주관', items: [
    { id: 'education', name: '교육부', src: education },
    { id: 'kiat', name: '한국산업기술진흥원(KIAT)', src: kiat },
    { id: 'bootcamp', name: 'AI부트캠프사업단', src: bootcamp },
  ] },
  { role: '주최', items: [
    { id: 'bootcamp', name: 'AI부트캠프사업단', src: bootcamp },
    { id: 'likelion', name: '충북대 멋쟁이사자처럼', src: likelion },
  ] },
  { role: '후원', items: [{ id: 'notion', name: 'Notion', src: notion }] },
] as const;

export const statistics = [
  { label: '참가자', value: 131, unit: '명' },
  { label: '참가 팀', value: 51, unit: '팀' },
  { label: '프로젝트', value: null, unit: '개' },
] as const;

export const sceneNames = ['AI 우왕톤', '주관·주최·후원', '숫자로 보는 우왕톤', '전시회 월'] as const;
export const sceneIds = ['intro', 'organizations', 'statistics', 'exhibition'] as const;

export const motion = {
  rayInterval: 96,
  rayDuration: 650,
  entryDuration: 1706,
  turnDuration: 660,
  rowDelay: 600,
  rowInterval: 195,
  rowDuration: 740,
} as const;
