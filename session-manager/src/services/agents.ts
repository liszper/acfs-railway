import { execAsUserSafe } from "../utils/shell.js";

export interface AgentProcess {
  pid: number;
  agent: string;
  session: string | null;
  cpu: number;
  mem: number;
  elapsed: string;
  command: string;
}

const AGENT_NAMES = ["claude", "codex", "gemini", "opencode"];

function detectAgent(command: string): string | null {
  const lower = command.toLowerCase();
  for (const name of AGENT_NAMES) {
    if (lower.includes(name)) return name;
  }
  return null;
}

export function getAgentProcesses(): AgentProcess[] {
  const raw = execAsUserSafe(
    "ps -eo pid,pcpu,pmem,etime,args --no-headers",
    10000
  );
  if (!raw) return [];

  const results: AgentProcess[] = [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const agent = detectAgent(trimmed);
    if (!agent) continue;

    // Parse: PID %CPU %MEM ELAPSED COMMAND...
    const match = trimmed.match(
      /^\s*(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\S+)\s+(.+)$/
    );
    if (!match) continue;

    const pid = parseInt(match[1], 10);
    const cpu = parseFloat(match[2]);
    const mem = parseFloat(match[3]);
    const elapsed = match[4];
    const command = match[5];

    // Try to extract session name from tmux context
    let session: string | null = null;
    try {
      const tmuxInfo = execAsUserSafe(
        `tmux list-panes -a -F '#{pane_pid} #{session_name}' 2>/dev/null`,
        3000
      );
      if (tmuxInfo) {
        for (const pline of tmuxInfo.split("\n")) {
          const parts = pline.trim().split(" ");
          if (parts.length >= 2 && parts[0] === String(pid)) {
            session = parts[1];
            break;
          }
        }
      }
    } catch {
      // tmux not available or no session found
    }

    results.push({ pid, agent, session, cpu, mem, elapsed, command });
  }

  return results;
}

export function getAgentStats(): { total: number; byType: Record<string, number> } {
  const procs = getAgentProcesses();
  const byType: Record<string, number> = {};
  for (const p of procs) {
    byType[p.agent] = (byType[p.agent] || 0) + 1;
  }
  return { total: procs.length, byType };
}
