import { execSync } from "node:child_process";
import { ACFS_USER } from "../config.js";
import { ttydInstances } from "./ttyd.js";
import { db } from "./db.js";
import type { SessionInfo, PaneInfo, AgentCounts } from "../types.js";

const PROCESS_LABELS: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex CLI",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
  node: "Node.js",
  python: "Python",
  python3: "Python",
  vim: "Editor",
  nvim: "Editor",
  zsh: "Shell",
  bash: "Shell",
};

// --- Prepared statements for sessions table ---

const stmtUpsertSession = db.prepare(
  `INSERT INTO sessions (name, cwd, status) VALUES (?, ?, 'active')
   ON CONFLICT(name) DO UPDATE SET status = 'active', terminated_at = NULL`
);

const stmtTerminateSession = db.prepare(
  `UPDATE sessions SET status = 'terminated', terminated_at = datetime('now') WHERE name = ?`
);

const stmtActiveSessions = db.prepare(
  `SELECT name, cwd, created_at FROM sessions WHERE status = 'active' ORDER BY created_at ASC`
);

const stmtSetSessionProject = db.prepare(
  `UPDATE sessions SET project_id = ? WHERE name = ?`
);

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

function getTmuxSessionMap(): Map<string, { windows: number; attached: number; created: number }> {
  const map = new Map();
  try {
    const output = execSync(
      `su - ${ACFS_USER} -c "tmux list-sessions -F '#S|#{session_windows}|#{session_attached}|#{session_created}'" 2>/dev/null`,
      { encoding: "utf8" }
    );
    for (const line of output.trim().split("\n").filter(Boolean)) {
      const [name, windows, attached, created] = line.split("|");
      map.set(name, {
        windows: parseInt(windows) || 0,
        attached: parseInt(attached) || 0,
        created: parseInt(created) || 0,
      });
    }
  } catch {}
  return map;
}

/**
 * Sync SQLite sessions with live tmux state.
 * - Any tmux session not in SQLite gets inserted.
 * - Any SQLite "active" session not in tmux gets marked terminated.
 */
export function syncSessionState(): void {
  const tmux = getTmuxSessionMap();
  const dbSessions = stmtActiveSessions.all() as { name: string; cwd: string | null; created_at: string }[];
  const dbNames = new Set(dbSessions.map((s) => s.name));

  // Insert tmux sessions missing from DB
  for (const name of tmux.keys()) {
    if (!dbNames.has(name)) {
      stmtUpsertSession.run(name, null);
    }
  }

  // Mark DB sessions that are no longer in tmux as terminated
  for (const s of dbSessions) {
    if (!tmux.has(s.name)) {
      stmtTerminateSession.run(s.name);
    }
  }
}

export function getTmuxSessions(): SessionInfo[] {
  const tmux = getTmuxSessionMap();

  // Sync DB state
  syncSessionState();

  const sessions: SessionInfo[] = [];
  for (const [name, info] of tmux) {
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

    sessions.push({
      name,
      windows: info.windows,
      attached: info.attached,
      created: info.created,
      hasTerminal: ttydInstances.has(name),
      url: `/s/${name}/`,
      process: proc,
      processLabel:
        PROCESS_LABELS[proc as keyof typeof PROCESS_LABELS] || proc,
      paneCount,
      agentCounts,
      isNtmSession,
    });
  }
  return sessions;
}

export function ensureTmuxSession(name: string, cwd?: string): boolean {
  assertSafeName(name);

  // Always persist to SQLite
  stmtUpsertSession.run(name, cwd || null);

  try {
    execSync(
      `su - ${ACFS_USER} -c "tmux has-session -t '${name}'" 2>/dev/null`
    );
    return true;
  } catch {
    const dir = cwd || "/data/projects";
    try {
      execSync(
        `su - ${ACFS_USER} -c "tmux new-session -d -s '${name}' -c '${dir}'" 2>/dev/null`
      );
      return true;
    } catch {
      return false;
    }
  }
}

export function killSession(name: string): void {
  assertSafeName(name);

  // Mark terminated in SQLite
  stmtTerminateSession.run(name);

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

export function sendToSession(name: string, command: string): void {
  assertSafeName(name);
  // command is a simple tool name (claude/codex/gemini/opencode) — safe to embed directly
  if (!/^[a-zA-Z0-9_-]+$/.test(command)) return;
  try {
    execSync(
      `su - ${ACFS_USER} -c "tmux send-keys -t '${name}' '${command}' Enter" 2>/dev/null`
    );
  } catch {}
}

export function setSessionProject(sessionName: string, projectId: number | null): void {
  stmtSetSessionProject.run(projectId, sessionName);
}

export { PROCESS_LABELS };
