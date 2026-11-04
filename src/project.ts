export interface ProjectSubmission {
  teamNumber: number;
  teamName: string;
  title: string;
  summary: string;
  thumbnail: string;
  screenshots: string[];
  problem: string;
  targetUsers: string[];
  features: string[];
  techHighlights: string[];
  techStack: string[];
  repositoryUrl: string;
  demoUrl: string;
  demoVideoUrl: string;
  members: { name: string; roles: string[]; contribution: string }[];
}
// The archive assigns a stable public ID; teams do not submit it.
export interface Project extends ProjectSubmission { id: string }
export const teamLabel = (project: Project) => `팀${project.teamNumber} - ${project.teamName}`;
