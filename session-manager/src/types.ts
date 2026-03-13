import type { ChildProcess } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";

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

export interface RecipeRole {
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

export type RequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
) => void;
