import { useState } from 'react';
import fallback from '../assets/gallery-fallback.svg';
import { teamLabel, type Project } from '../project';
import { projectHash } from '../projectLocation';
import { Card, CardHeader, CardFooter } from './ui/card';

export function ProjectCard({ project, onOpen }: { project: Project; onOpen: (id: string, trigger: HTMLAnchorElement) => void }) {
  const [failedImage, setFailedImage] = useState<string>();
  const hasImage = Boolean(project.thumbnail && project.thumbnail !== failedImage);
  return <li>
    <article aria-labelledby={`project-${project.id}`}>
      <a className="project-card-link" href={projectHash(project.id)} aria-haspopup="dialog"
        onClick={event => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault(); onOpen(project.id, event.currentTarget);
        }}>
      <Card className="project-card">
        <img className="project-image" src={hasImage ? project.thumbnail : fallback}
          alt=""
          width={1200} height={675}
          onError={hasImage ? () => setFailedImage(project.thumbnail) : undefined} />
        <CardHeader>
          <h3 id={`project-${project.id}`}>{project.title}</h3>
          <p className="project-summary">{project.summary}</p>
        </CardHeader>
        <CardFooter><p className="project-team">{teamLabel(project)}</p></CardFooter>
        <span className="sr-only">상세 보기</span>
      </Card>
      </a>
    </article>
  </li>;
}
