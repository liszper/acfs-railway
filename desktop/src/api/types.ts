export interface SessionInfo {
  name: string;
  windows: number;
  attached: number;
  created: number;
  hasTerminal: boolean;
  url: string;
  process: string;
  processLabel: string;
  paneCount: number;
  agentCounts: { claude: number; codex: number; gemini: number };
  isNtmSession: boolean;
}

export interface NtmSpawnOpts {
  recipe?: string;
  template?: string;
  cc?: number;
  cod?: number;
  gmi?: number;
  prompt?: string;
  projectPath?: string;
}

export interface ToolStatusMap { [tool: string]: boolean }
export interface SystemStats { cpu: number | null; memUsed: number | null; memTotal: number | null; diskUsed: number | null; diskTotal: number | null }
export interface EnvStatus { ANTHROPIC_API_KEY: boolean; OPENAI_API_KEY: boolean; GEMINI_API_KEY: boolean; GH_TOKEN: boolean }

export interface ProjectInfo {
  name: string;
  path: string;
  isGitRepo: boolean;
  branch: string | null;
  remote: string | null;
  remoteUrl: string | null;
  ahead: number;
  behind: number;
  staged: number;
  modified: number;
  untracked: number;
  clean: boolean;
  lastCommit: { hash: string; shortHash: string; message: string; author: string; date: string } | null;
}

export interface ProjectRecord {
  id: number;
  name: string;
  path: string;
  description: string;
  status: 'active' | 'archived' | 'template';
  tags: string[];
  remoteUrl: string | null;
  defaultBranch: string | null;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
  pinned: boolean;
  stats?: { commits: number; sessions: number; lastActivity: string | null };
}

export interface ActivityRecord {
  id: number;
  projectId: number | null;
  sessionName: string | null;
  type: string;
  summary: string;
  detail: string;
  createdAt: string;
}

// ── Git types ──────────────────────────────────────────────────────────────

export interface FileChange { path: string; status: string; }

export interface GitStatus {
  branch: string | null;
  remote: string | null;
  ahead: number;
  behind: number;
  staged: FileChange[];
  modified: FileChange[];
  untracked: string[];
  conflicts: string[];
  clean: boolean;
}

export interface ProjectDetail {
  info: ProjectInfo;
  status: GitStatus;
}

export interface FileTreeEntry {
  name: string;
  path: string;
  isDir: boolean;
  gitStatus?: string;
}

export interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}

export interface BranchInfo {
  name: string;
  current: boolean;
}

// ── NTM types ──────────────────────────────────────────────────────────────

export interface NtmRecipe {
  id: string;
  name: string;
  desc: string;
  agents: string;
  cc: number;
  cod: number;
  gmi: number;
}

export interface NtmWorkflow {
  id: string;
  name: string;
  pattern: string;
  desc: string;
  roles: { name: string; agent: string; desc: string }[];
  agents: { cc: number; cod: number; gmi: number };
}

// ── Agent Monitor types ────────────────────────────────────────────────────

export interface AgentProcess {
  pid: number;
  agent: string;
  session: string | null;
  cpu: number;
  mem: number;
  elapsed: string;
  command: string;
}

// ── Beads types ────────────────────────────────────────────────────────────

export interface BeadsRecommendation {
  id: number | string;
  title: string;
  score?: number;
  reason?: string;
  priority?: number;
  type?: string;
  status?: string;
}

export interface BeadsTriage {
  quick_ref?: Record<string, unknown>;
  recommendations?: BeadsRecommendation[];
  quick_wins?: BeadsRecommendation[];
  blockers_to_clear?: BeadsRecommendation[];
  project_health?: Record<string, unknown>;
  error?: string;
}

// ── Event types ────────────────────────────────────────────────────────────

export interface AuditEvent {
  timestamp: string;
  action: string;
  path: string;
  agent?: string;
  detail?: string;
  branch?: string;
  sha?: string;
  size?: number;
}
