import { execSync } from "node:child_process";
import { ACFS_USER } from "../config.js";
import { PROCESS_LABELS } from "../dashboard/data.js";
import { ttydInstances } from "./ttyd.js";
import type { SessionInfo, PaneInfo, AgentCounts } from "../types.js";

function assertSafeName(name: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid session name: ${name}`);
  }
}

function getSessionProcess(name: string): string {
  try {
    const output = execSync(
      `su - ${ACFS_USER} -c "tmux list-panes -t '${name}' -F '#{pane_current_command}'" 2>/dev/null`,
      { encoding: "utf8", timeout: 2000 }
    );
    return output.trim().split("\n")[0] || "zsh";
  } catch {
    return "zsh";
  }
}

function getSessionPaneProcesses(name: string): PaneInfo[] {
  try {
    const output = execSync(
      `su - ${ACFS_USER} -c "tmux list-panes -t '${name}' -F '#{pane_index}|#{pane_current_command}'" 2>/dev/null`,
      { encoding: "utf8", timeout: 2000 }
    );
    return output
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [idx, cmd] = line.split("|");
        return { pane: parseInt(idx) || 0, process: cmd || "zsh" };
      });
  } catch {
    return [];
  }
}

export function getTmuxSessions(): SessionInfo[] {
  try {
    const output = execSync(
      `su - ${ACFS_USER} -c "tmux list-sessions -F '#S|#{session_windows}|#{session_attached}|#{session_created}'" 2>/dev/null`,
      { encoding: "utf8" }
    );
    return output
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, windows, attached, created] = line.split("|");
        const proc = getSessionProcess(name);
        const panes = getSessionPaneProcesses(name);
        const paneCount = panes.length || 1;

        const agentCounts: AgentCounts = { claude: 0, codex: 0, gemini: 0 };
        panes.forEach((p) => {
          if (p.process === "claude") agentCounts.claude++;
          else if (p.process === "codex") agentCounts.codex++;
          else if (p.process === "gemini") agentCounts.gemini++;
        });

        const isNtmSession =
          agentCounts.claude + agentCounts.codex + agentCounts.gemini > 1 ||
          paneCount > 1;

        return {
          name,
          windows: parseInt(windows) || 0,
          attached: parseInt(attached) || 0,
          created: parseInt(created) || 0,
          hasTerminal: ttydInstances.has(name),
          url: `/s/${name}/`,
          process: proc,
          processLabel:
            PROCESS_LABELS[proc as keyof typeof PROCESS_LABELS] || proc,
          paneCount,
          agentCounts,
          isNtmSession,
        };
      });
  } catch {
    return [];
  }
}

export function ensureTmuxSession(name: string): boolean {
  assertSafeName(name);
  try {
    execSync(
      `su - ${ACFS_USER} -c "tmux has-session -t '${name}'" 2>/dev/null`
    );
    return true;
  } catch {
    try {
      execSync(
        `su - ${ACFS_USER} -c "tmux new-session -d -s '${name}' -c /data/projects" 2>/dev/null`
      );
      return true;
    } catch {
      return false;
    }
  }
}

export function killSession(name: string): void {
  assertSafeName(name);
  const inst = ttydInstances.get(name);
  if (inst) {
    try {
      process.kill(inst.pid);
    } catch {}
    ttydInstances.delete(name);
  }
  try {
    execSync(
      `su - ${ACFS_USER} -c "tmux kill-session -t '${name}'" 2>/dev/null`
    );
  } catch {}
}
