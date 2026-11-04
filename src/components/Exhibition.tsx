import { useRef } from 'react';
import { clsx } from 'clsx';
import type { ReactElement } from 'react';
import { createPortal } from 'react-dom';
import logo from '../assets/event-logo.svg';
import bootcamp from '../assets/gallery-bootcamp.svg';
import likelion from '../assets/gallery-likelion.svg';
import cross from '../assets/collaboration-mark.svg';
import searchIcon from '../assets/magnifying-glass.svg';
import github from '../assets/github.svg';
import mail from '../assets/mail.svg';
import type { Project } from '../project';
import { useProjectSearch } from '../hooks/useProjectSearch';
import { ProjectCard } from './ProjectCard';
import { useProjectNavigation } from '../hooks/useProjectNavigation';
import { ProjectDetail } from './ProjectDetail';
import { Button } from './ui/button';
import { Icon } from './ui/icon';
import { InputGroup, InputGroupAddon, InputGroupInput } from './ui/input-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import './Exhibition.css';

function IconHint({ label, children }: { label: string; children: ReactElement }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent>{label}</TooltipContent></Tooltip>;
}
export function Exhibition({ projects: allProjects, active, reducedMotion, entering = false }: {
  projects: readonly Project[];
  active: boolean;
  reducedMotion: boolean;
  entering?: boolean;
}) {
  const search = useProjectSearch(allProjects);
  const detail = useProjectNavigation(allProjects);
  const searchRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const projects = search.results;
  function resetSearch() { search.clear(); searchRef.current?.focus(); }
  function backToTop() {
    const heading = headingRef.current;
    const scroller = heading?.closest('.scene');
    heading?.focus({ preventScroll: true });
    scroller?.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
  }
  return <TooltipProvider delayDuration={250}>
    <div className="exhibition-content" inert={active && detail.isOpen} aria-hidden={active && detail.isOpen || undefined}>
      <header className="gallery-header" role="banner">
        <img className="gallery-logo" src={logo} alt="AI 우왕톤" width={760} height={333} />
        <div className="gallery-hosts" role="img" aria-label="AI부트캠프사업단과 충북대 멋쟁이사자처럼 공동 주최">
          <img className="gallery-host-logo" src={bootcamp} alt="" width={656} height={105} />
          <img className="gallery-cross" src={cross} alt="" width={12} height={12} />
          <img className="gallery-host-logo" src={likelion} alt="" width={624} height={169} />
        </div>
      </header>
      <main className="gallery-main" aria-labelledby="exhibition">
        <h2 className="sr-only" id="exhibition" ref={headingRef} tabIndex={-1}>전시회 월</h2>
        <div className="gallery-toolbar">
          <p className="project-count">{projects.length}개 프로젝트</p>
          <search className="gallery-search" aria-label="프로젝트 검색">
            <label className="sr-only" htmlFor="project-search">프로젝트명, 팀명, 기술명으로 검색</label>
            <InputGroup>
              <InputGroupInput ref={searchRef} id="project-search" type="search" {...search.inputProps}
                placeholder="프로젝트명, 팀명, 기술명으로 검색"
                autoComplete="off" spellCheck={false} aria-controls="project-list" />
              <InputGroupAddon aria-hidden="true"><Icon src={searchIcon} size={18} /></InputGroupAddon>
            </InputGroup>
          </search>
        </div>
        <p className="sr-only" role={detail.isOpen ? undefined : 'status'} aria-live={detail.isOpen ? 'off' : 'polite'} aria-atomic="true">
          {search.isSearching ? `검색 결과 ${projects.length}개` : `전체 프로젝트 ${allProjects.length}개`}
        </p>
        <div id="project-list">
          {projects.length ? <ul className="project-grid" aria-label="프로젝트 목록">
            {projects.map(project => <ProjectCard key={project.id} project={project} onOpen={detail.open} />)}
            </ul> : allProjects.length === 0 ? <div className="gallery-empty"><p>등록된 프로젝트가 없습니다.</p></div> : <div className="gallery-empty">
            <p>검색 결과가 없습니다.</p>
            <p>다른 프로젝트명, 팀명, 기술명으로 찾아보세요.</p>
            <Button type="button" onClick={resetSearch}>검색 초기화</Button>
          </div>}
        </div>
      </main>
      <footer className="gallery-footer" role="contentinfo">
        <img className="gallery-footer-logo" src={logo} alt="AI 우왕톤" width={760} height={333} />
        <nav className="gallery-footer-links" aria-label="행사 링크">
          <IconHint label="우왕톤 GitHub 조직 (새 탭)">
            <Button asChild variant="ghost" size="icon"><a href="https://github.com/woowangthon" target="_blank"
              rel="noopener noreferrer" aria-label="우왕톤 GitHub 조직 (새 탭)"><Icon src={github} size={24} /></a></Button>
          </IconHint>
          <IconHint label="운영 문의 이메일">
            <Button asChild variant="ghost" size="icon"><a href="mailto:chungbuk.univ@likelion.org"
              aria-label="운영 문의 이메일"><Icon src={mail} size={24} /></a></Button>
          </IconHint>
        </nav>
      </footer>
    </div>
    {detail.project && <ProjectDetail project={detail.project} open={active && detail.isOpen} onClose={detail.close}
      onRestore={() => { if (!detail.restoreList()) search.clear(); }} />}
    {(active || entering) && !detail.isOpen && createPortal(<IconHint label="맨 위로">
      <Button type="button" className={clsx('gallery-back-to-top', { 'is-gallery-entering': entering })} inert={entering} aria-hidden={entering || undefined}
        variant="outline" size="icon" aria-label="맨 위로" onClick={backToTop}>
        <svg aria-hidden="true" width="44" height="44" viewBox="0 0 44 44" fill="none"><path d="M32 22L22 12L12 22M22 12V32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </Button>
    </IconHint>, document.body)}
  </TooltipProvider>;
}
