import type { ChildProcess } from "node:child_process";

export interface TtydInstance {
  port: number;
  process: ChildProcess;
  pid: number;
}

export interface PaneInfo {
  pane: number;
  process: string;
}

export interface AgentCounts {
  claude: number;
  codex: number;
  gemini: number;
}

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
  agentCounts: AgentCounts;
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

export interface NtmResult {
  ok?: boolean;
  name?: string;
  url?: string;
  error?: string;
}

export interface SystemStats {
  cpu: number | null;
  memUsed: number | null;
  memTotal: number | null;
  diskUsed: number | null;
  diskTotal: number | null;
}

export interface EnvStatus {
  ANTHROPIC_API_KEY: boolean;
  OPENAI_API_KEY: boolean;
  GEMINI_API_KEY: boolean;
  GH_TOKEN: boolean;
}

export interface ToolStatusMap {
  [tool: string]: boolean;
}

interface RecipeRole {
  name: string;
  agent: string;
  desc: string;
}

export interface Recipe {
  id: string;
  name: string;
  desc: string;
  detail: string;
  useCase: string;
  agents: string;
  cc: number;
  cod: number;
  gmi: number;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  pattern: string;
  desc: string;
  detail: string;
  roles: RecipeRole[];
  agents: { cc: number; cod: number; gmi: number };
}

export interface CliAuthInfo {
  configured: boolean;
  authenticated: boolean;
  user?: string;
}

export interface SshKeyInfo {
  hasPrivateKey: boolean;
  hasPublicKey: boolean;
  publicKey: string | null;
  fingerprint: string | null;
  source: "environment" | "generated" | "none";
}

export interface SecretsStatus {
  aiKeys: {
    anthropic: boolean;
    openai: boolean;
    gemini: boolean;
  };
  github: {
    token: boolean;
    sshKey: boolean;
    gitName: string | null;
    gitEmail: string | null;
  };
  cloudCLIs: {
    railway: CliAuthInfo;
    vercel: CliAuthInfo;
    supabase: CliAuthInfo;
    cloudflare: CliAuthInfo;
    vault: { configured: boolean };
  };
  ssh: SshKeyInfo;
  terminal: {
    user: string;
    passwordDefault: boolean;
  };
  container: {
    user: string;
    hostname: string;
  };
  dotfiles: {
    repo: string | null;
    loaded: boolean;
  };
  webhooks: {
    url: boolean;
    secret: boolean;
  };
  agentLimits: {
    memLimit: string | null;
    nproc: string | null;
  };
  opencode: Record<string, string>;
  cliAuthCacheAge: number | null;
}

export interface GitConfigInput {
  name?: string;
  email?: string;
}

export interface SshGenerateResult {
  publicKey: string;
  fingerprint: string;
  created: boolean;
}

export interface FileChange {
  path: string;
  status: "M" | "A" | "D" | "R" | "C" | "U" | "??";
}

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

export interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}

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
  lastCommit: CommitInfo | null;
}

export interface FileTreeEntry {
  name: string;
  path: string;
  isDir: boolean;
  gitStatus?: string;
}

export interface ProjectDetail {
  info: ProjectInfo;
  status: GitStatus;
}

export interface WsData {
  sessionName: string;
  port: number;
  upstream: WebSocket | null;
  pending: (string | Buffer)[];
}
