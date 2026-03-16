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
