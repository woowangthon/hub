const sample = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1280" height="960"/%3E';
import type { Project } from '../project';
// Isolated regression fixtures. Never imported by the application or production build.
const technologySets = [
  ['React', 'Spring Boot', 'MySQL', 'OpenAI API'], ['Next.js', 'TypeScript'], ['Python', 'FastAPI'],
  ['Vue', 'Firebase'], ['Kotlin', 'Android'], ['Swift', 'iOS'],
  ['React', 'Node.js'], ['Python', 'Streamlit'], ['Svelte', 'Supabase'],
  ['Flutter', 'Dart'], ['Java', 'MySQL'], ['Go', 'PostgreSQL'],
];
export const testProjects: Project[] = technologySets.map((techStack, index) => ({
  id: `project-${index + 1}`, title: `프로젝트${index + 1}`,
  summary: '프로젝트 소개가 들어갑니다.', teamNumber: index + 1, teamName: `팀${index + 1}`,
  thumbnail: '', screenshots: [], techStack,
  problem: '해결하려는 문제에 대한 설명이 들어갑니다.',
  targetUsers: ['대상 사용자에 대한 설명이 들어갑니다.'],
  features: ['주요 기능에 대한 설명이 들어갑니다.'],
  techHighlights: ['기술적 특징에 대한 설명이 들어갑니다.'],
  repositoryUrl: '', demoUrl: '', demoVideoUrl: '',
  members: [{ name: '팀원', roles: ['담당 역할'], contribution: '프로젝트 기여 내용이 들어갑니다.' }],
}));
testProjects[0] = {
  id: 'project-1', teamNumber: 2, teamName: '우왕팀', title: '캠퍼스 길잡이',
  summary: '흩어진 학교 공지와 일정을 대화로 찾아주는 서비스입니다.',
  thumbnail: sample, screenshots: [sample],
  problem: '학교 공지가 여러 사이트에 흩어져 있어 필요한 정보를 찾기 어렵고, 신청 기간을 놓치기 쉽습니다.',
  targetUsers: ['학교 공지를 빠르게 확인하고 싶은 대학생', '장학금과 대외활동 신청 일정을 관리하려는 학생'],
  features: ['질문에 맞는 학교 공지를 찾아 요약하고 원문을 안내합니다.', '공지에서 신청 기간과 행사 일정을 추출합니다.', '관심 있는 일정을 개인 캘린더에 저장합니다.'],
  techHighlights: ['공지 원문을 검색한 뒤 AI가 답변을 생성하고 출처를 함께 제공합니다.', '공지 수집과 AI 요약을 분리해 처리하고, 중복 공지는 저장하지 않습니다.'],
  techStack: technologySets[0], repositoryUrl: 'https://github.com/woowangthon',
  demoUrl: 'https://example.com', demoVideoUrl: 'https://www.youtube.com',
  members: [
    { name: '홍길동', roles: ['기획', '프론트엔드'], contribution: '사용자 흐름 설계와 공지 검색 화면 구현' },
    { name: '김우왕', roles: ['백엔드', 'AI'], contribution: '공지 수집 API와 AI 요약 기능 구현' },
  ],
};
