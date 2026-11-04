import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import type { Project } from '../project';
import { teamLabel } from '../project';
import { externalUrl, projectUrl } from '../projectLocation';
import fallback from '../assets/gallery-fallback.svg';
import closeIcon from '../assets/close.svg';
import linkIcon from '../assets/link.svg';
import externalIcon from '../assets/external-link.svg';
import { Button } from './ui/button';
import { Icon } from './ui/icon';
import { Badge } from './ui/badge';
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table';
import './ProjectDetail.css';

function DetailImage({ src, title, screenshot = false }: { src: string; title: string; screenshot?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (screenshot && (!src || failed)) return <p className="detail-image-error" role="status">이미지를 불러오지 못했습니다.</p>;
  const placeholder = !src || failed;
  return <img src={placeholder ? fallback : src} alt={placeholder ? `${title} 준비 중` : title}
    className={clsx({ 'detail-screenshot': screenshot, 'detail-thumbnail': !screenshot, 'detail-thumbnail-fallback': !screenshot && placeholder })}
    onError={failed ? undefined : () => setFailed(true)} loading={screenshot ? 'lazy' : 'eager'} />;
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="detail-section"><h3>{title}</h3>{children}</section>;
}
function TextList({ items, bullets = false }: { items: string[]; bullets?: boolean }) {
  return <ul className={bullets ? 'detail-bullets' : undefined}>{items.map((text, index) => <li key={index}>{text}</li>)}</ul>;
}
function ActionLink({ href, children }: { href: string; children: ReactNode }) {
  const safe = externalUrl(href);
  return safe ? <Button asChild variant="outline" className="detail-action"><a href={safe} target="_blank" rel="noopener noreferrer">
    {children}<Icon src={externalIcon} size={16} /><span className="sr-only"> (새 탭)</span>
  </a></Button> : null;
}
export function ProjectDetail({ project, open, onClose, onRestore }: {
  project: Project; open: boolean; onClose: () => void; onRestore: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [copyFeedback, setCopyFeedback] = useState<'idle' | 'copied' | 'error'>('idle');
  const copyFailed = copyFeedback === 'error';
  const copyStatus = copyFeedback === 'copied' ? '주소를 복사했습니다.' : copyFailed ? '주소 복사에 실패했습니다.' : '';
  const fallbackRef = useRef<HTMLInputElement>(null);
  const copyRequest = useRef(0);
  const copyTimer = useRef<number | undefined>(undefined);
  function focusTitle() {
    const title = titleRef.current;
    title?.focus({ preventScroll: true });
    const bounds = title?.getBoundingClientRect();
    const panel = title?.closest('.detail-scroll')?.getBoundingClientRect();
    if (bounds && panel && (bounds.bottom > panel.bottom || bounds.top < panel.top)) title?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }
  useLayoutEffect(() => {
    if (!open) return;
    setCopyFeedback('idle');
    focusTitle();
    const scroller = document.getElementById('scene-exhibition');
    const previous = scroller?.style.overflow ?? '';
    if (scroller) scroller.style.overflow = 'hidden';
    return () => {
      if (scroller) scroller.style.overflow = previous;
      copyRequest.current++;
      window.clearTimeout(copyTimer.current);
    };
  }, [open, project.id]);
  useLayoutEffect(() => { if (copyFailed) { fallbackRef.current?.focus(); fallbackRef.current?.select(); } }, [copyFailed]);
  async function copyUrl() {
    const request = ++copyRequest.current;
    window.clearTimeout(copyTimer.current);
    try {
      await navigator.clipboard.writeText(projectUrl(project.id));
      if (request !== copyRequest.current) return;
      setCopyFeedback('copied');
      copyTimer.current = window.setTimeout(() => {
        if (request === copyRequest.current) setCopyFeedback('idle');
      }, 4000);
    } catch {
      if (request !== copyRequest.current) return;
      setCopyFeedback('error');
    }
  }
  return <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
    <DialogContent onOpenAutoFocus={event => {
      event.preventDefault();
      focusTitle();
    }}
      onCloseAutoFocus={event => { event.preventDefault(); onRestore(); }}>
      <div className="detail-scroll" key={project.id} role="region" aria-label={`${project.title} 상세 내용`} tabIndex={0}>
        <DetailImage key={project.thumbnail} src={project.thumbnail} title={`${project.title} 대표 이미지`} />
        <div className="detail-header">
          <DialogTitle ref={titleRef} tabIndex={-1}>{project.title}</DialogTitle>
          <p className="detail-team">{teamLabel(project)}</p>
          <DialogDescription>{project.summary}</DialogDescription>
          <div className="detail-actions">
            <ActionLink href={project.demoUrl}>서비스 열기</ActionLink>
            <ActionLink href={project.demoVideoUrl}>시연 영상</ActionLink>
            <ActionLink href={project.repositoryUrl}>GitHub</ActionLink>
          </div>
        </div>
        <div className="detail-body">
          <Section title="해결하려는 문제"><p>{project.problem}</p></Section>
          <Section title="대상 사용자"><TextList items={project.targetUsers} /></Section>
          <Section title="주요 기능"><TextList items={project.features} bullets /></Section>
          <Section title="기술적 특징"><TextList items={project.techHighlights} bullets /></Section>
          <Section title="기술 스택"><div className="detail-badges">{project.techStack.map(tech => <Badge key={tech}>{tech}</Badge>)}</div></Section>
          <Section title="팀원 소개">
            <div className="detail-table-scroll" role="region" aria-label="팀원 소개 표" tabIndex={0}>
              <Table className="detail-members" aria-label="팀원 소개">
                <colgroup><col /><col /><col /></colgroup>
                <TableHeader><TableRow><TableHead scope="col">이름</TableHead><TableHead scope="col">담당 역할</TableHead><TableHead scope="col">기여 내용</TableHead></TableRow></TableHeader>
                <TableBody>{project.members.map((member, index) => <TableRow key={index}>
                  <TableHead scope="row">{member.name}</TableHead><TableCell>{member.roles.join(' · ')}</TableCell><TableCell>{member.contribution}</TableCell>
                </TableRow>)}</TableBody>
              </Table>
            </div>
          </Section>
          {project.screenshots.length > 0 && <Section title="추가 화면"><div className="detail-screenshots">
            {project.screenshots.map((src, index) => <DetailImage key={`${project.id}-${src}-${index}`} src={src} title={`${project.title} 추가 화면 ${index + 1}`} screenshot />)}
          </div></Section>}
        </div>
      </div>
      <div className="detail-controls">
        <Button variant="ghost" size="icon" aria-label="프로젝트 주소 복사" onClick={copyUrl}><Icon src={linkIcon} size={18} /></Button>
        <DialogClose asChild><Button variant="ghost" size="icon" aria-label="프로젝트 상세 닫기"><Icon src={closeIcon} size={18} /></Button></DialogClose>
        <div className={copyStatus ? 'detail-copy-feedback' : 'sr-only'}><p role="status" aria-atomic="true">{copyStatus}</p>
          {copyFailed && <input ref={fallbackRef} aria-label="공유 주소" readOnly value={projectUrl(project.id)} onFocus={event => event.currentTarget.select()} />}
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
