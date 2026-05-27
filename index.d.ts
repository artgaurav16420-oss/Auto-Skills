export interface Skill {
  name: string;
  description: string;
  path?: string;
  hash?: string;
  embedding?: number[];
}

export interface ScoreResult {
  name: string;
  score: number;
  details: {
    keywordScore: number;
    semanticScore: number;
    similarity?: number;
  };
}

export interface Intent {
  domains: string[];
  actions: string[];
  technologies: string[];
  keywords: string[];
}

export interface ProjectContext {
  language: string | null;
  framework: string | null;
  libraries: string[];
  testingTools: string[];
}

export interface ScoreOptions {
  useSemantic?: boolean;
  skillsIndex?: { project: ProjectContext; skills: Skill[] } | Skill[];
  computeSemantic?: (query: string, description: string, cachedEmb?: number[]) => Promise<{ score: number; similarity: number }>;
  reranker?: (top3: (ScoreResult & { description: string })[], query: string) => Promise<{ name: string }>;
}

export function score(skills: Skill[], taskText: string, options?: ScoreOptions): Promise<ScoreResult[]>;
export function tokenize(text: string, opts?: { expandSynonyms?: boolean }): string[];
export function extractIntent(text: string): Intent;
export function loadSkills(customPath?: string): Skill[];
export function parseSkillFrontmatter(content: string): { name: string; description: string } | null;
export function discoverSkills(dirs?: string[]): Skill[];
export function buildSkillIndex(outputPath?: string, scanDirs?: string[], projectContext?: ProjectContext, computeEmbeddings?: (desc: string) => Promise<number[]>): Promise<Skill[] | { project: ProjectContext; skills: Skill[] }>;
export function detectProjectContext(projectDir?: string): ProjectContext;
export function clearCache(): void;
export function resetSynonyms(): void;
export function loadSynonyms(): Record<string, string[]>;
