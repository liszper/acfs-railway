#!/usr/bin/env node
// ACFS Session Manager
// Routes browser tabs to individual tmux sessions via ttyd instances
// GET /           → dashboard with all sessions + NTM spawn panel
// GET /s/<name>   → ttyd terminal for that tmux session
// POST /api/sessions          → create a new session
// DELETE /api/sessions/<name> → kill a session
// GET /api/sessions           → list sessions as JSON
// POST /api/ntm/spawn         → spawn NTM multi-agent session
// POST /api/ntm/send          → send prompt to NTM session
// POST /api/ntm/interrupt     → interrupt NTM session
// GET /api/ntm/status/:name   → get NTM session status

const http = require("http");
const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const PORT = parseInt(process.env.PORT || "7681");
const TTYD_USER = process.env.TTYD_USER || "admin";
const TTYD_PASS = process.env.TTYD_PASS || "changeme";
const ACFS_USER = process.env.ACFS_USER || "dev";
const ACFS_HOSTNAME = process.env.ACFS_HOSTNAME || "acfs";
const BASE_TTYD_PORT = 17681; // internal ports for ttyd instances
const CODE_SERVER_PORT = 18080; // code-server's own port (separate Railway domain)
const CODE_SERVER_URL = process.env.CODE_SERVER_URL || "#";

// Track running ttyd instances: { sessionName: { port, process, pid } }
const instances = new Map();
let nextPort = BASE_TTYD_PORT;

const PROCESS_LABELS = {
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

// ---------------------------------------------------------------------------
// Shell escape helper — wrap in single quotes, escape embedded single quotes
// ---------------------------------------------------------------------------
function shellEscape(str) {
  return "'" + String(str).replace(/'/g, "'\\''") + "'";
}

// ---------------------------------------------------------------------------
// NTM availability check (cached for 30 seconds)
// ---------------------------------------------------------------------------
let ntmAvailableCache = null;
let ntmAvailableCacheTime = 0;

function isNtmAvailable() {
  const now = Date.now();
  if (ntmAvailableCache !== null && now - ntmAvailableCacheTime < 30000) {
    return ntmAvailableCache;
  }
  try {
    execSync(`su - ${ACFS_USER} -c "which ntm" 2>/dev/null`, {
      encoding: "utf8",
      timeout: 3000,
    });
    ntmAvailableCache = true;
  } catch {
    ntmAvailableCache = false;
  }
  ntmAvailableCacheTime = now;
  return ntmAvailableCache;
}

// ---------------------------------------------------------------------------
// Tool inventory — batch check and cache for 60 seconds
// ---------------------------------------------------------------------------
const TOOL_LIST = [
  'claude', 'codex', 'gemini', 'opencode', 'ntm', 'cass', 'br', 'bv', 'dcg', 'slb',
  'ubs', 'cm', 'sg', 'rg', 'bat', 'fd', 'eza', 'delta', 'fzf', 'zoxide',
  'lazygit', 'atuin', 'pt', 'rano', 'caut', 'ms', 'apr', 'ru', 'jfp', 's2p',
  'brenner', 'giil', 'csctf', 'mdwb', 'aadc', 'toon', 'am', 'gh', 'railway',
  'wrangler', 'supabase', 'vercel', 'vault', 'code-server', 'gopls', 'pyright', 'rust-analyzer'
];

let toolStatusResult = null;
let toolStatusTime = 0;
let lastCpuReading = null;

function getToolStatus() {
  const now = Date.now();
  if (toolStatusResult !== null && now - toolStatusTime < 60000) {
    return toolStatusResult;
  }
  const result = {};
  try {
    const checks = TOOL_LIST.map(t => `command -v ${t} >/dev/null 2>&1 && echo "${t}:1" || echo "${t}:0"`).join('; ');
    const output = execSync(`su - ${ACFS_USER} -c ${shellEscape(checks)}`, {
      encoding: 'utf8',
      timeout: 15000
    });
    output.trim().split('\n').forEach(line => {
      const parts = line.trim().split(':');
      if (parts[0]) result[parts[0]] = parts[1] === '1';
    });
  } catch {
    TOOL_LIST.forEach(t => { result[t] = false; });
  }
  toolStatusResult = result;
  toolStatusTime = now;
  return result;
}

function getSystemStats() {
  const stats = { cpu: null, memUsed: null, memTotal: null, diskUsed: null, diskTotal: null };
  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
    const memTotalKB = parseInt((meminfo.match(/MemTotal:\s+(\d+)/) || [])[1] || '0');
    const memAvailKB = parseInt((meminfo.match(/MemAvailable:\s+(\d+)/) || [])[1] || '0');
    stats.memTotal = memTotalKB * 1024;
    stats.memUsed = (memTotalKB - memAvailKB) * 1024;
  } catch {}
  try {
    const stat = fs.readFileSync('/proc/stat', 'utf8');
    const parts = stat.split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
    const idle = parts[3] + (parts[4] || 0);
    const total = parts.reduce((a, b) => a + b, 0);
    if (lastCpuReading) {
      const idleDelta = idle - lastCpuReading.idle;
      const totalDelta = total - lastCpuReading.total;
      if (totalDelta > 0) stats.cpu = (1 - idleDelta / totalDelta) * 100;
    }
    lastCpuReading = { idle, total };
  } catch {}
  try {
    const df = execSync('df -B1 /data 2>/dev/null || df -B1 / 2>/dev/null', {
      encoding: 'utf8', timeout: 3000
    });
    const lines = df.trim().split('\n');
    if (lines.length >= 2) {
      const cols = lines[1].trim().split(/\s+/);
      stats.diskTotal = parseInt(cols[1]) || null;
      stats.diskUsed = parseInt(cols[2]) || null;
    }
  } catch {}
  return stats;
}

function getEnvStatus() {
  return {
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    GH_TOKEN: !!process.env.GH_TOKEN
  };
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------
function getSessionProcess(name) {
  try {
    const output = execSync(
      `su - ${ACFS_USER} -c "tmux list-panes -t '${name}' -F '#{pane_current_command}'" 2>/dev/null`,
      { encoding: "utf8", timeout: 2000 }
    );
    const cmd = output.trim().split("\n")[0];
    return cmd || "zsh";
  } catch {
    return "zsh";
  }
}

function getSessionPaneCount(name) {
  try {
    const output = execSync(
      `su - ${ACFS_USER} -c "tmux list-panes -t '${name}'" 2>/dev/null`,
      { encoding: "utf8", timeout: 2000 }
    );
    return output.trim().split("\n").filter(Boolean).length;
  } catch {
    return 1;
  }
}

function getSessionPaneProcesses(name) {
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

function getTmuxSessions() {
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
        const process = getSessionProcess(name);
        const panes = getSessionPaneProcesses(name);
        const paneCount = panes.length || 1;

        // Derive agent summary from pane processes
        let agentCounts = { claude: 0, codex: 0, gemini: 0 };
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
          hasTerminal: instances.has(name),
          url: `/s/${name}/`,
          process,
          processLabel: PROCESS_LABELS[process] || process,
          paneCount,
          agentCounts,
          isNtmSession,
        };
      });
  } catch {
    return [];
  }
}

function ensureTmuxSession(name) {
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

function startTtydForSession(sessionName) {
  if (instances.has(sessionName)) return instances.get(sessionName).port;

  const port = nextPort++;
  const proc = spawn(
    "ttyd",
    [
      "-W",
      "-p",
      String(port),
      "-c",
      `${TTYD_USER}:${TTYD_PASS}`,
      "-t",
      `titleFixed=${sessionName} — ${ACFS_HOSTNAME}`,
      "-b",
      `/s/${sessionName}`,
      "su",
      "-",
      ACFS_USER,
      "-c",
      `tmux attach-session -t '${sessionName}' || tmux new-session -s '${sessionName}' -c /data/projects`,
    ],
    { stdio: "ignore", detached: true }
  );

  proc.unref();
  instances.set(sessionName, { port, process: proc, pid: proc.pid });

  proc.on("exit", () => {
    instances.delete(sessionName);
  });

  return port;
}

function killSession(name) {
  const inst = instances.get(name);
  if (inst) {
    try {
      process.kill(inst.pid);
    } catch {}
    instances.delete(name);
  }
  try {
    execSync(
      `su - ${ACFS_USER} -c "tmux kill-session -t '${name}'" 2>/dev/null`
    );
  } catch {}
}

// ---------------------------------------------------------------------------
// NTM command helpers
// ---------------------------------------------------------------------------
function ntmSpawn(name, opts) {
  if (!isNtmAvailable()) return { error: "ntm not available" };
  let args = `ntm spawn ${shellEscape(name)}`;
  if (opts.recipe) {
    args += ` --recipe=${shellEscape(opts.recipe)}`;
  } else if (opts.template) {
    args += ` --template=${shellEscape(opts.template)}`;
  } else {
    if (opts.cc) args += ` --cc=${parseInt(opts.cc)}`;
    if (opts.cod) args += ` --cod=${parseInt(opts.cod)}`;
    if (opts.gmi) args += ` --gmi=${parseInt(opts.gmi)}`;
  }
  if (opts.prompt) {
    args += ` --prompt=${shellEscape(opts.prompt)}`;
  }
  try {
    execSync(`su - ${ACFS_USER} -c ${shellEscape(args)}`, {
      encoding: "utf8",
      timeout: 15000,
    });
    return { ok: true, name, url: `/s/${name}/` };
  } catch (e) {
    return { error: e.message || "ntm spawn failed" };
  }
}

function ntmSend(session, prompt, target) {
  if (!isNtmAvailable()) return { error: "ntm not available" };
  let args = `ntm send ${shellEscape(session)}`;
  if (target && target !== "all") {
    args += ` --${target}`;
  }
  args += ` ${shellEscape(prompt)}`;
  try {
    execSync(`su - ${ACFS_USER} -c ${shellEscape(args)}`, {
      encoding: "utf8",
      timeout: 5000,
    });
    return { ok: true };
  } catch (e) {
    return { error: e.message || "ntm send failed" };
  }
}

function ntmInterrupt(session) {
  if (!isNtmAvailable()) return { error: "ntm not available" };
  try {
    execSync(
      `su - ${ACFS_USER} -c ${shellEscape("ntm interrupt " + shellEscape(session))}`,
      { encoding: "utf8", timeout: 5000 }
    );
    return { ok: true };
  } catch (e) {
    return { error: e.message || "ntm interrupt failed" };
  }
}

function ntmStatus(session) {
  if (!isNtmAvailable()) return { error: "ntm not available" };
  try {
    const output = execSync(
      `su - ${ACFS_USER} -c ${shellEscape("ntm status " + shellEscape(session) + " --json")}`,
      { encoding: "utf8", timeout: 3000 }
    );
    return JSON.parse(output.trim());
  } catch (e) {
    return { error: e.message || "ntm status failed" };
  }
}

// ---------------------------------------------------------------------------
// Simple HTTP proxy to ttyd
// ---------------------------------------------------------------------------
function proxyRequest(req, res, targetPort) {
  const options = {
    hostname: "127.0.0.1",
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${targetPort}` },
  };

  const proxy = http.request(options, (proxyRes) => {
    // Handle WebSocket upgrade separately
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxy.on("error", (err) => {
    res.writeHead(502);
    res.end(`Proxy error: ${err.message}`);
  });

  req.pipe(proxy);
}

const codeServerAvailable =
  CODE_SERVER_URL && CODE_SERVER_URL !== "#" && CODE_SERVER_URL !== "";

// ---------------------------------------------------------------------------
// Recipes and templates data (embedded, no external deps)
// ---------------------------------------------------------------------------
const NTM_RECIPES = [
  {
    id: "minimal",
    name: "Single Agent",
    desc: "One Claude agent for focused work",
    detail: "Best for single-file edits, quick fixes, and simple tasks. One agent means zero coordination overhead.",
    useCase: "Bug fixes, small features, config changes",
    agents: "1x Claude",
    cc: 1,
    cod: 0,
    gmi: 0,
  },
  {
    id: "quick-claude",
    name: "Quick Start",
    desc: "Two Claude agents for parallel tasks",
    detail: "Split work between two Claude agents. One can implement while the other reviews or works on a separate module.",
    useCase: "Parallel feature development, implement + review",
    agents: "2x Claude",
    cc: 2,
    cod: 0,
    gmi: 0,
  },
  {
    id: "full-stack",
    name: "Full Stack Team",
    desc: "Multi-model coverage for complex projects",
    detail: "Claude handles architecture and complex logic, Codex handles boilerplate and repetitive code, Gemini provides a different perspective for review.",
    useCase: "Full-stack apps, large refactors, new projects",
    agents: "3x Claude + 2x Codex + 1x Gemini",
    cc: 3,
    cod: 2,
    gmi: 1,
  },
  {
    id: "balanced",
    name: "Balanced Team",
    desc: "Equal representation across models",
    detail: "Each model brings unique strengths. Equal distribution maximizes diversity of approach and catches model-specific blind spots.",
    useCase: "Exploratory work, comparing approaches, diversified review",
    agents: "2x Claude + 2x Codex + 2x Gemini",
    cc: 2,
    cod: 2,
    gmi: 2,
  },
  {
    id: "codex-heavy",
    name: "Codex Focus",
    desc: "Codex-led team with Claude oversight",
    detail: "Codex excels at code generation speed. Claude provides oversight and handles architectural decisions. Good for high-volume code output.",
    useCase: "Rapid prototyping, boilerplate generation, test writing",
    agents: "1x Claude + 4x Codex",
    cc: 1,
    cod: 4,
    gmi: 0,
  },
  {
    id: "review-team",
    name: "Code Review",
    desc: "Dedicated reviewers with one implementer",
    detail: "One Codex implements while two Claudes review independently. Catches more bugs through redundant review.",
    useCase: "Critical code changes, security-sensitive work, production deploys",
    agents: "2x Claude + 1x Codex",
    cc: 2,
    cod: 1,
    gmi: 0,
  },
];

const NTM_TEMPLATES = [
  {
    id: "red-green",
    name: "TDD Red-Green",
    pattern: "ping-pong",
    desc: "Tester writes failing tests, implementer makes them pass",
    detail: "Agent A writes a failing test. Agent B writes minimal code to pass it. Agent A writes the next test. Continues until the feature is complete.",
    roles: [
      { name: "Tester", agent: "Claude", desc: "Writes failing tests that define expected behavior" },
      { name: "Implementer", agent: "Codex", desc: "Writes minimal code to make each test pass" },
    ],
    agents: { cc: 1, cod: 1, gmi: 0 },
  },
  {
    id: "review-pipeline",
    name: "Review Pipeline",
    pattern: "review-gate",
    desc: "Author implements, 2 reviewers must approve",
    detail: "One agent implements the change. Two independent reviewers analyze for bugs, style, and correctness. Both must approve before the change is accepted.",
    roles: [
      { name: "Author", agent: "Codex", desc: "Implements the feature or fix" },
      { name: "Reviewer 1", agent: "Claude", desc: "Reviews for correctness and architecture" },
      { name: "Reviewer 2", agent: "Claude", desc: "Reviews for edge cases and security" },
    ],
    agents: { cc: 2, cod: 1, gmi: 0 },
  },
  {
    id: "specialist-team",
    name: "Specialist Team",
    pattern: "pipeline",
    desc: "Architect > 2 Implementers > QA tester",
    detail: "Pipeline workflow: Architect designs the solution and defines interfaces, passes to implementers who build in parallel, then QA validates the integrated result.",
    roles: [
      { name: "Architect", agent: "Claude", desc: "Designs the solution and defines interfaces" },
      { name: "Implementer A", agent: "Codex", desc: "Builds frontend / module A" },
      { name: "Implementer B", agent: "Codex", desc: "Builds backend / module B" },
      { name: "QA", agent: "Gemini", desc: "Tests the integrated result" },
    ],
    agents: { cc: 1, cod: 2, gmi: 1 },
  },
  {
    id: "parallel-explore",
    name: "Parallel Exploration",
    pattern: "parallel",
    desc: "3 agents explore different approaches simultaneously",
    detail: "Three agents independently tackle the same problem using different strategies. Compare outputs to pick the best approach or combine insights.",
    roles: [
      { name: "Explorer A", agent: "Claude", desc: "Conventional/safe solution" },
      { name: "Explorer B", agent: "Codex", desc: "Performance-optimized solution" },
      { name: "Explorer C", agent: "Gemini", desc: "Alternative/creative solution" },
    ],
    agents: { cc: 1, cod: 1, gmi: 1 },
  },
];

// ---------------------------------------------------------------------------
// Dashboard HTML
// ---------------------------------------------------------------------------
function dashboardHTML(sessions) {
  const recipesJSON = JSON.stringify(NTM_RECIPES);
  const templatesJSON = JSON.stringify(NTM_TEMPLATES);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${ACFS_HOSTNAME} — ACFS Session Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace;
    background: #0d1117;
    color: #c9d1d9;
    min-height: 100vh;
    padding: 2rem;
  }

  .header {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  h1 {
    color: #58a6ff;
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #3fb950;
    display: inline-block;
    flex-shrink: 0;
    position: relative;
    top: -1px;
    transition: background 0.3s ease;
  }
  .status-dot.disconnected {
    background: #f85149;
  }

  .subtitle {
    color: #8b949e;
    margin-bottom: 2rem;
    font-size: 0.85rem;
  }

  /* ---- Spawn panel ---- */
  .spawn-panel {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    margin-bottom: 2rem;
    overflow: hidden;
  }

  .spawn-tabs {
    display: flex;
    border-bottom: 1px solid #30363d;
    background: #0d1117;
  }
  .spawn-tab {
    padding: 0.6rem 1.25rem;
    font-size: 0.8rem;
    font-family: inherit;
    color: #8b949e;
    background: transparent;
    border: none;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: color 0.15s ease, border-color 0.15s ease;
    white-space: nowrap;
  }
  .spawn-tab:hover { color: #c9d1d9; }
  .spawn-tab.active {
    color: #58a6ff;
    border-bottom-color: #58a6ff;
  }

  .spawn-body {
    padding: 1.25rem;
  }
  .spawn-pane { display: none; }
  .spawn-pane.active { display: block; }

  /* Quick session */
  .quick-row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
  }

  /* Recipe/template grid */
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 0.75rem;
  }
  .card {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    transition: border-color 0.15s ease;
    overflow: hidden;
  }
  .card:hover { border-color: #484f58; }
  .card.expanded { border-color: #58a6ff; }

  .card-summary {
    padding: 1rem;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .card-summary-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.5rem;
  }
  .card-summary-left { flex: 1; min-width: 0; }

  .card-chevron {
    width: 20px;
    height: 20px;
    color: #484f58;
    transition: transform 0.2s ease, color 0.15s ease;
    flex-shrink: 0;
    margin-top: 2px;
  }
  .card:hover .card-chevron { color: #8b949e; }
  .card.expanded .card-chevron { transform: rotate(180deg); color: #58a6ff; }

  .card-name {
    font-weight: 600;
    font-size: 0.9rem;
    color: #f0f6fc;
    margin-bottom: 0.25rem;
  }
  .card-desc {
    font-size: 0.75rem;
    color: #8b949e;
    margin-bottom: 0.5rem;
    line-height: 1.35;
  }
  .card-agents {
    display: flex;
    gap: 0.375rem;
    flex-wrap: wrap;
  }
  .card-pattern {
    display: inline-block;
    font-size: 0.65rem;
    color: #58a6ff;
    background: rgba(88, 166, 255, 0.1);
    padding: 2px 8px;
    border-radius: 10px;
    margin-bottom: 0.5rem;
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .card-agent-count {
    font-size: 0.7rem;
    color: #484f58;
    margin-left: auto;
    white-space: nowrap;
  }

  /* Expandable detail section */
  .card-detail {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.3s ease;
  }
  .card.expanded .card-detail {
    max-height: 800px;
  }
  .card-detail-inner {
    padding: 0 1rem 1rem;
    border-top: 1px solid #21262d;
  }
  .card-detail-text {
    font-size: 0.75rem;
    color: #8b949e;
    line-height: 1.5;
    margin-top: 0.75rem;
    margin-bottom: 0.75rem;
  }
  .card-use-case {
    font-size: 0.7rem;
    color: #484f58;
    margin-bottom: 0.75rem;
  }
  .card-use-case strong {
    color: #8b949e;
    font-weight: 500;
  }

  /* Role breakdown */
  .card-roles {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  .card-roles-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: #484f58;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.15rem;
  }
  .card-role {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.45rem 0.6rem;
    background: rgba(22, 27, 34, 0.5);
    border: 1px solid #21262d;
    border-radius: 4px;
  }
  .card-role-name {
    font-size: 0.7rem;
    font-weight: 600;
    color: #c9d1d9;
    white-space: nowrap;
    min-width: 80px;
  }
  .card-role-agent {
    font-size: 0.6rem;
    padding: 1px 6px;
    border-radius: 8px;
    font-weight: 500;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .card-role-agent.agent-claude { background: rgba(88, 166, 255, 0.15); color: #58a6ff; }
  .card-role-agent.agent-codex { background: rgba(63, 185, 80, 0.15); color: #3fb950; }
  .card-role-agent.agent-gemini { background: rgba(210, 153, 34, 0.15); color: #d29922; }
  .card-role-desc {
    font-size: 0.7rem;
    color: #8b949e;
    line-height: 1.35;
    flex: 1;
  }

  /* Spawn form inside cards */
  .card-spawn-form {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    padding-top: 0.75rem;
    border-top: 1px solid #21262d;
  }
  .card-spawn-agents {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .card-spawn-agents .agent-counter { gap: 0.35rem; }
  .card-spawn-agents .agent-counter label { font-size: 0.75rem; min-width: 46px; }
  .card-spawn-agents .counter-btn { width: 24px; height: 24px; font-size: 0.8rem; }
  .card-spawn-agents .counter-val { width: 28px; height: 24px; line-height: 24px; font-size: 0.8rem; }
  .card-spawn-agents .counter-controls { border-radius: 3px; }

  .card-spawn-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .card-spawn-row input[type="text"] {
    background: #161b22;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 0.35rem 0.65rem;
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.75rem;
    flex: 1;
    min-width: 0;
    outline: none;
    width: auto;
  }
  .card-spawn-row input[type="text"]:focus { border-color: #58a6ff; }
  .card-spawn-row input[type="text"]::placeholder { color: #484f58; }
  .card-spawn-textarea {
    width: 100%;
    background: #161b22;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 0.4rem 0.65rem;
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.75rem;
    resize: vertical;
    min-height: 48px;
    outline: none;
    box-sizing: border-box;
  }
  .card-spawn-textarea:focus { border-color: #58a6ff; }
  .card-spawn-textarea::placeholder { color: #484f58; }

  .card-footer {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .card-footer input {
    background: #161b22;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 0.35rem 0.65rem;
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.75rem;
    flex: 1;
    min-width: 0;
    outline: none;
  }
  .card-footer input:focus { border-color: #58a6ff; }
  .card-footer input::placeholder { color: #484f58; }

  /* Agent pills */
  .agent-pill {
    font-size: 0.65rem;
    padding: 2px 7px;
    border-radius: 10px;
    font-weight: 500;
    white-space: nowrap;
  }
  .pill-claude { background: rgba(88, 166, 255, 0.15); color: #58a6ff; }
  .pill-codex { background: rgba(63, 185, 80, 0.15); color: #3fb950; }
  .pill-gemini { background: rgba(210, 153, 34, 0.15); color: #d29922; }

  /* Custom spawn */
  .custom-form {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  .custom-agents {
    display: flex;
    gap: 1.5rem;
    align-items: center;
    grid-column: 1 / -1;
  }
  .agent-counter {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .agent-counter label {
    font-size: 0.8rem;
    font-weight: 500;
    min-width: 52px;
  }
  .label-claude { color: #58a6ff; }
  .label-codex { color: #3fb950; }
  .label-gemini { color: #d29922; }

  .counter-controls {
    display: flex;
    align-items: center;
    gap: 0;
    border: 1px solid #30363d;
    border-radius: 4px;
    overflow: hidden;
  }
  .counter-btn {
    width: 28px;
    height: 28px;
    background: #21262d;
    border: none;
    color: #c9d1d9;
    font-size: 0.85rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: inherit;
    transition: background 0.1s ease;
  }
  .counter-btn:hover { background: #30363d; }
  .counter-val {
    width: 32px;
    text-align: center;
    font-size: 0.85rem;
    font-weight: 600;
    color: #f0f6fc;
    background: #0d1117;
    border-left: 1px solid #30363d;
    border-right: 1px solid #30363d;
    height: 28px;
    line-height: 28px;
  }

  .custom-prompt {
    grid-column: 1 / -1;
  }
  .custom-prompt textarea {
    width: 100%;
    background: #0d1117;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.8rem;
    resize: vertical;
    min-height: 60px;
    outline: none;
  }
  .custom-prompt textarea:focus { border-color: #58a6ff; }
  .custom-prompt textarea::placeholder { color: #484f58; }

  .custom-bottom {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    grid-column: 1 / -1;
  }

  /* ---- Buttons ---- */
  .toolbar {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 2rem;
    align-items: center;
    flex-wrap: wrap;
  }

  input[type="text"], .input {
    background: #161b22;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-family: inherit;
    font-size: 0.85rem;
    width: 240px;
    outline: none;
    transition: border-color 0.15s ease;
  }
  input[type="text"]:focus, .input:focus {
    border-color: #58a6ff;
  }
  input[type="text"]::placeholder, .input::placeholder { color: #484f58; }

  .btn {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid #30363d;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-create { background: #238636; color: #fff; border-color: #238636; }
  .btn-create:hover:not(:disabled) { background: #2ea043; }
  .btn-open { background: #1f6feb; color: #fff; border-color: #1f6feb; }
  .btn-open:hover { background: #388bfd; }
  .btn-kill { background: transparent; color: #f85149; border-color: #f85149; }
  .btn-kill:hover { background: rgba(248, 81, 73, 0.12); }
  .btn-interrupt { background: transparent; color: #d29922; border-color: #d29922; font-size: 0.7rem; padding: 0.3rem 0.6rem; }
  .btn-interrupt:hover { background: rgba(210, 153, 34, 0.12); }
  .btn-send { background: #21262d; color: #c9d1d9; border-color: #30363d; font-size: 0.7rem; padding: 0.3rem 0.6rem; }
  .btn-send:hover { background: #30363d; color: #f0f6fc; }
  .btn-code { background: #21262d; color: #c9d1d9; border-color: #30363d; }
  .btn-code:hover { background: #30363d; color: #f0f6fc; }
  .btn-sm { font-size: 0.75rem; padding: 0.35rem 0.65rem; }

  /* ---- Sessions grid ---- */
  .section-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #484f58;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 0.75rem;
  }

  .sessions {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 1rem;
  }

  .session {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 1.25rem;
    cursor: pointer;
    transition: border-color 0.15s ease, transform 0.15s ease, opacity 0.3s ease;
  }
  .session:hover {
    border-color: #58a6ff;
    transform: translateY(-1px);
  }
  .session.fade-in {
    animation: fadeIn 0.3s ease forwards;
  }
  .session.fade-out {
    animation: fadeOut 0.25s ease forwards;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeOut {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(-8px); }
  }

  .session-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
    gap: 0.5rem;
  }
  .session-name {
    font-weight: 600;
    font-size: 1.05rem;
    color: #f0f6fc;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .session-badges {
    display: flex;
    gap: 0.375rem;
    align-items: center;
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .badge {
    font-size: 0.7rem;
    padding: 2px 8px;
    border-radius: 12px;
    font-weight: 500;
    white-space: nowrap;
  }
  .badge-attached { background: rgba(63, 185, 80, 0.15); color: #3fb950; }
  .badge-detached { background: rgba(139, 148, 158, 0.15); color: #8b949e; }

  .badge-process { background: rgba(88, 166, 255, 0.12); color: #58a6ff; }
  .badge-process.agent {
    background: rgba(210, 153, 34, 0.15);
    color: #d29922;
  }
  .badge-process.shell {
    background: rgba(139, 148, 158, 0.1);
    color: #6e7681;
  }

  .session-agents {
    display: flex;
    gap: 0.375rem;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }

  .session-meta {
    color: #8b949e;
    font-size: 0.8rem;
    margin-bottom: 0.75rem;
  }
  .session-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.65rem;
  }

  /* Inline send prompt row on session card */
  .session-send {
    display: flex;
    gap: 0.35rem;
    align-items: center;
    padding-top: 0.65rem;
    border-top: 1px solid #21262d;
  }
  .session-send input {
    flex: 1;
    background: #0d1117;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 0.3rem 0.5rem;
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.75rem;
    outline: none;
    min-width: 0;
  }
  .session-send input:focus { border-color: #58a6ff; }
  .session-send input::placeholder { color: #484f58; }

  .session-send select {
    background: #0d1117;
    border: 1px solid #30363d;
    color: #8b949e;
    padding: 0.3rem 0.35rem;
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.7rem;
    outline: none;
    cursor: pointer;
  }

  .empty {
    text-align: center;
    padding: 4rem 2rem;
    color: #484f58;
    border: 1px dashed #30363d;
    border-radius: 8px;
    grid-column: 1 / -1;
  }
  .empty p { margin-bottom: 0.5rem; }
  .empty p:last-child { margin-bottom: 0; }

  /* Status toast */
  .toast {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    background: #161b22;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 0.65rem 1rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-family: inherit;
    opacity: 0;
    transform: translateY(8px);
    transition: opacity 0.2s ease, transform 0.2s ease;
    pointer-events: none;
    z-index: 999;
  }
  .toast.visible {
    opacity: 1;
    transform: translateY(0);
  }
  .toast.error { border-color: #f85149; color: #f85149; }
  .toast.success { border-color: #3fb950; color: #3fb950; }

  /* ---- Tools tab ---- */
  .tool-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
  .tool-pill {
    font-size: 0.65rem;
    padding: 2px 9px;
    border-radius: 10px;
    font-weight: 500;
    white-space: nowrap;
    border: 1px solid;
    transition: opacity 0.15s ease;
  }
  .tool-pill.installed {
    background: rgba(63, 185, 80, 0.1);
    color: #3fb950;
    border-color: rgba(63, 185, 80, 0.3);
  }
  .tool-pill.missing {
    background: rgba(248, 81, 73, 0.06);
    color: #f85149;
    border-color: rgba(248, 81, 73, 0.2);
    opacity: 0.7;
  }
  .tools-section {
    margin-bottom: 1.25rem;
  }
  .tools-section:last-child { margin-bottom: 0; }
  .tools-section-header {
    font-size: 0.75rem;
    font-weight: 600;
    color: #8b949e;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 0.65rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .tools-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
    margin-bottom: 1.25rem;
  }
  .tools-row:last-child { margin-bottom: 0; }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }
  .stat-card {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 0.65rem;
    text-align: center;
  }
  .stat-value {
    font-size: 1.15rem;
    font-weight: 700;
    color: #58a6ff;
  }
  .stat-label {
    font-size: 0.65rem;
    color: #8b949e;
    margin-top: 0.2rem;
  }
  .env-grid {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .env-item {
    font-size: 0.8rem;
    padding: 0.35rem 0.7rem;
    border-radius: 6px;
    background: #0d1117;
    border: 1px solid #30363d;
  }
  .env-item.configured { color: #3fb950; }
  .env-item.missing { color: #f85149; opacity: 0.8; }
  .env-icon { font-weight: 700; margin-right: 0.15rem; }
  .search-row {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .search-row input {
    flex: 1;
    background: #0d1117;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 0.4rem 0.65rem;
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.8rem;
    outline: none;
  }
  .search-row input:focus { border-color: #58a6ff; }
  .search-row input::placeholder { color: #484f58; }
  .results-list {
    max-height: 200px;
    min-height: 48px;
    overflow-y: auto;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 0.35rem;
  }
  .result-item {
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid #21262d;
  }
  .result-item:last-child { border-bottom: none; }
  .result-title {
    font-size: 0.78rem;
    color: #f0f6fc;
    font-weight: 500;
  }
  .result-snippet {
    font-size: 0.7rem;
    color: #8b949e;
    margin-top: 0.1rem;
    line-height: 1.35;
  }
  @media (max-width: 768px) {
    .tools-row { grid-template-columns: 1fr; }
    .stats-grid { grid-template-columns: repeat(3, 1fr); }
  }
</style>
</head>
<body>
  <div class="header">
    <h1>${ACFS_HOSTNAME}</h1>
    <span class="status-dot" id="statusDot" title="Connected"></span>
  </div>
  <p class="subtitle">
    ACFS Session Dashboard
    <span id="sessionCount">&middot; ${sessions.length} session${sessions.length !== 1 ? "s" : ""} active</span>
  </p>

  <!-- Spawn Panel -->
  <div class="spawn-panel">
    <div class="spawn-tabs">
      <button class="spawn-tab active" data-tab="quick" onclick="switchTab('quick')">Quick Session</button>
      <button class="spawn-tab" data-tab="recipes" onclick="switchTab('recipes')">Recipes</button>
      <button class="spawn-tab" data-tab="templates" onclick="switchTab('templates')">Workflows</button>
      <button class="spawn-tab" data-tab="custom" onclick="switchTab('custom')">Custom</button>
      <button class="spawn-tab" data-tab="tools" onclick="switchTab('tools')">Tools</button>
    </div>
    <div class="spawn-body">

      <!-- Tab 1: Quick Session -->
      <div class="spawn-pane active" id="pane-quick">
        <div class="quick-row">
          <input type="text" id="newSession" placeholder="Session name..." style="width:220px" onkeydown="if(event.key==='Enter')createSession()">
          <button class="btn btn-create" onclick="createSession()">+ New Session</button>
          ${codeServerAvailable ? `<a href="${CODE_SERVER_URL}" target="_blank" class="btn btn-code">VS Code</a>` : ""}
        </div>
      </div>

      <!-- Tab 2: Recipes -->
      <div class="spawn-pane" id="pane-recipes">
        <div class="card-grid" id="recipeGrid"></div>
      </div>

      <!-- Tab 3: Workflow Templates -->
      <div class="spawn-pane" id="pane-templates">
        <div class="card-grid" id="templateGrid"></div>
      </div>

      <!-- Tab 4: Custom -->
      <div class="spawn-pane" id="pane-custom">
        <div class="custom-form">
          <div class="custom-agents">
            <div class="agent-counter">
              <label class="label-claude">Claude</label>
              <div class="counter-controls">
                <button class="counter-btn" onclick="adjustCounter('cc', -1)">-</button>
                <span class="counter-val" id="cc-val">1</span>
                <button class="counter-btn" onclick="adjustCounter('cc', 1)">+</button>
              </div>
            </div>
            <div class="agent-counter">
              <label class="label-codex">Codex</label>
              <div class="counter-controls">
                <button class="counter-btn" onclick="adjustCounter('cod', -1)">-</button>
                <span class="counter-val" id="cod-val">0</span>
                <button class="counter-btn" onclick="adjustCounter('cod', 1)">+</button>
              </div>
            </div>
            <div class="agent-counter">
              <label class="label-gemini">Gemini</label>
              <div class="counter-controls">
                <button class="counter-btn" onclick="adjustCounter('gmi', -1)">-</button>
                <span class="counter-val" id="gmi-val">0</span>
                <button class="counter-btn" onclick="adjustCounter('gmi', 1)">+</button>
              </div>
            </div>
          </div>
          <div class="custom-prompt">
            <textarea id="customPrompt" placeholder="Initial prompt (optional)..." rows="2"></textarea>
          </div>
          <div class="custom-bottom">
            <input type="text" id="customName" placeholder="Session name..." style="width:200px">
            <button class="btn btn-create" onclick="spawnCustom()">Spawn Team</button>
          </div>
        </div>
      </div>

      <!-- Tab 5: Tools -->
      <div class="spawn-pane" id="pane-tools">
        <div class="tools-section">
          <div class="tools-section-header">
            <span>Tool Inventory</span>
            <button class="btn btn-sm" onclick="refreshToolStatus()" style="font-size:0.65rem;padding:0.2rem 0.5rem">Refresh</button>
          </div>
          <div class="tool-grid" id="toolGrid"><span style="color:#8b949e;font-size:0.75rem">Switch to this tab to load tool status</span></div>
        </div>
        <div class="tools-row">
          <div class="tools-section">
            <div class="tools-section-header">System Stats</div>
            <div class="stats-grid" id="statsGrid">
              <div class="stat-card"><div class="stat-value">--</div><div class="stat-label">CPU</div></div>
              <div class="stat-card"><div class="stat-value">--</div><div class="stat-label">Memory</div></div>
              <div class="stat-card"><div class="stat-value">--</div><div class="stat-label">Disk</div></div>
            </div>
          </div>
          <div class="tools-section">
            <div class="tools-section-header">Environment</div>
            <div class="env-grid" id="envGrid"><span style="color:#8b949e;font-size:0.75rem">Loading...</span></div>
          </div>
        </div>
        <div class="tools-row">
          <div class="tools-section">
            <div class="tools-section-header">CASS Search</div>
            <div class="search-row">
              <input type="text" id="cassQuery" placeholder="Search snippets..." onkeydown="if(event.key==='Enter')searchCASS()">
              <button class="btn btn-create btn-sm" onclick="searchCASS()">Search</button>
            </div>
            <div class="results-list" id="cassResults"><span style="color:#484f58;font-size:0.75rem;padding:0.25rem">Enter a query to search CASS</span></div>
          </div>
          <div class="tools-section">
            <div class="tools-section-header">
              <span>CAUT Usage</span>
              <button class="btn btn-sm" onclick="fetchCAUT()" style="font-size:0.65rem;padding:0.2rem 0.5rem">Refresh</button>
            </div>
            <div class="results-list" id="cautResults"><span style="color:#484f58;font-size:0.75rem;padding:0.25rem">Click Refresh to load usage</span></div>
          </div>
        </div>
      </div>

    </div>
  </div>

  <!-- Active Sessions -->
  <div class="section-label">Active Sessions</div>
  <div class="sessions" id="sessionsGrid">
  </div>

  <div class="toast" id="toast"></div>

  <script>
    var currentSessions = ${JSON.stringify(sessions)};
    var pollFailures = 0;
    var customCounts = { cc: 1, cod: 0, gmi: 0 };
    var toolsTabLoaded = false;
    var sysStatsTimer = null;

    var RECIPES = ${recipesJSON};
    var TEMPLATES = ${templatesJSON};

    var AGENT_PROCESSES = { claude: true, codex: true, gemini: true, opencode: true };
    var SHELL_PROCESSES = { zsh: true, bash: true };
    var PROCESS_LABELS = ${JSON.stringify(PROCESS_LABELS)};

    // ---- Toast notifications ----
    var toastTimer = null;
    function showToast(msg, type) {
      var el = document.getElementById('toast');
      el.textContent = msg;
      el.className = 'toast ' + (type || '') + ' visible';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function() { el.className = 'toast'; }, 3000);
    }

    // ---- Tab switching ----
    function switchTab(id) {
      var tabs = document.querySelectorAll('.spawn-tab');
      var panes = document.querySelectorAll('.spawn-pane');
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.toggle('active', tabs[i].dataset.tab === id);
      }
      for (var j = 0; j < panes.length; j++) {
        panes[j].classList.toggle('active', panes[j].id === 'pane-' + id);
      }
      if (id === 'tools' && !toolsTabLoaded) {
        toolsTabLoaded = true;
        initToolsTab();
      }
    }

    // ---- Counter controls ----
    function adjustCounter(key, delta) {
      customCounts[key] = Math.max(0, Math.min(10, customCounts[key] + delta));
      document.getElementById(key + '-val').textContent = customCounts[key];
    }

    // ---- Helpers ----
    function getProcessBadgeClass(proc) {
      if (AGENT_PROCESSES[proc]) return 'badge-process agent';
      if (SHELL_PROCESSES[proc]) return 'badge-process shell';
      return 'badge-process';
    }

    function getProcessLabel(proc) {
      return PROCESS_LABELS[proc] || proc;
    }

    function escapeHtml(str) {
      var d = document.createElement('div');
      d.textContent = str;
      return d.innerHTML;
    }

    function genSessionName(prefix) {
      return prefix + '-' + Date.now().toString(36);
    }

    function agentPillsHTML(cc, cod, gmi) {
      var pills = [];
      if (cc > 0) pills.push('<span class="agent-pill pill-claude">' + cc + 'x Claude</span>');
      if (cod > 0) pills.push('<span class="agent-pill pill-codex">' + cod + 'x Codex</span>');
      if (gmi > 0) pills.push('<span class="agent-pill pill-gemini">' + gmi + 'x Gemini</span>');
      return pills.join('');
    }

    var chevronSVG = '<svg class="card-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6l4 4 4-4"/></svg>';

    var recipeCounters = {};
    RECIPES.forEach(function(r) {
      recipeCounters[r.id] = { cc: r.cc, cod: r.cod, gmi: r.gmi };
    });

    function adjustRecipeCounter(recipeId, key, delta) {
      var c = recipeCounters[recipeId];
      c[key] = Math.max(0, Math.min(10, c[key] + delta));
      var el = document.getElementById('rc-' + recipeId + '-' + key);
      if (el) el.textContent = c[key];
    }

    function toggleCard(cardId) {
      var card = document.getElementById(cardId);
      if (card) card.classList.toggle('expanded');
    }

    function agentCounterHTML(recipeId, key, label, colorClass, val) {
      return '<div class="agent-counter">' +
        '<label class="' + colorClass + '">' + label + '</label>' +
        '<div class="counter-controls">' +
          '<button class="counter-btn" onclick="event.stopPropagation();adjustRecipeCounter(\\'' + recipeId + '\\',\\'' + key + '\\',-1)">-</button>' +
          '<span class="counter-val" id="rc-' + recipeId + '-' + key + '">' + val + '</span>' +
          '<button class="counter-btn" onclick="event.stopPropagation();adjustRecipeCounter(\\'' + recipeId + '\\',\\'' + key + '\\',1)">+</button>' +
        '</div>' +
      '</div>';
    }

    function roleAgentClass(agent) {
      if (agent === 'Claude') return 'agent-claude';
      if (agent === 'Codex') return 'agent-codex';
      if (agent === 'Gemini') return 'agent-gemini';
      return '';
    }

    function renderRecipes() {
      var grid = document.getElementById('recipeGrid');
      grid.innerHTML = '';
      RECIPES.forEach(function(r) {
        var total = r.cc + r.cod + r.gmi;
        var div = document.createElement('div');
        div.className = 'card';
        div.id = 'recipe-' + r.id;
        div.innerHTML =
          '<div class="card-summary" onclick="toggleCard(\\'recipe-' + r.id + '\\')">' +
            '<div class="card-summary-top">' +
              '<div class="card-summary-left">' +
                '<div class="card-name">' + escapeHtml(r.name) + '</div>' +
                '<div class="card-desc">' + escapeHtml(r.desc) + '</div>' +
                '<div class="card-agents">' + agentPillsHTML(r.cc, r.cod, r.gmi) +
                  '<span class="card-agent-count">' + total + ' agent' + (total !== 1 ? 's' : '') + '</span>' +
                '</div>' +
              '</div>' +
              chevronSVG +
            '</div>' +
          '</div>' +
          '<div class="card-detail">' +
            '<div class="card-detail-inner">' +
              '<div class="card-detail-text">' + escapeHtml(r.detail || '') + '</div>' +
              (r.useCase ? '<div class="card-use-case"><strong>Best for:</strong> ' + escapeHtml(r.useCase) + '</div>' : '') +
              '<div class="card-spawn-form" onclick="event.stopPropagation()">' +
                '<div class="card-spawn-agents">' +
                  agentCounterHTML(r.id, 'cc', 'Claude', 'label-claude', r.cc) +
                  agentCounterHTML(r.id, 'cod', 'Codex', 'label-codex', r.cod) +
                  agentCounterHTML(r.id, 'gmi', 'Gemini', 'label-gemini', r.gmi) +
                '</div>' +
                '<div class="card-spawn-row">' +
                  '<input type="text" placeholder="Session name..." id="rname-' + r.id + '">' +
                  '<input type="text" placeholder="Project path..." id="rpath-' + r.id + '">' +
                '</div>' +
                '<textarea class="card-spawn-textarea" placeholder="Initial prompt (optional)..." id="rprompt-' + r.id + '"></textarea>' +
                '<div class="card-spawn-row">' +
                  '<button class="btn btn-create btn-sm" onclick="spawnRecipe(\\'' + r.id + '\\')">Spawn</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>';
        grid.appendChild(div);
      });
    }

    function renderTemplates() {
      var grid = document.getElementById('templateGrid');
      grid.innerHTML = '';
      TEMPLATES.forEach(function(t) {
        var rolesHTML = '';
        if (t.roles && t.roles.length > 0) {
          rolesHTML = '<div class="card-roles"><div class="card-roles-label">Agent Roles</div>';
          t.roles.forEach(function(role) {
            rolesHTML +=
              '<div class="card-role">' +
                '<span class="card-role-name">' + escapeHtml(role.name) + '</span>' +
                '<span class="card-role-agent ' + roleAgentClass(role.agent) + '">' + escapeHtml(role.agent) + '</span>' +
                '<span class="card-role-desc">' + escapeHtml(role.desc) + '</span>' +
              '</div>';
          });
          rolesHTML += '</div>';
        }
        var agentsObj = t.agents || {};
        var totalAgents = (agentsObj.cc || 0) + (agentsObj.cod || 0) + (agentsObj.gmi || 0);

        var div = document.createElement('div');
        div.className = 'card';
        div.id = 'template-' + t.id;
        div.innerHTML =
          '<div class="card-summary" onclick="toggleCard(\\'template-' + t.id + '\\')">' +
            '<div class="card-summary-top">' +
              '<div class="card-summary-left">' +
                '<div class="card-name">' + escapeHtml(t.name) + '</div>' +
                '<div class="card-pattern">' + escapeHtml(t.pattern) + '</div>' +
                '<div class="card-desc">' + escapeHtml(t.desc) + '</div>' +
                '<div class="card-agents">' + agentPillsHTML(agentsObj.cc || 0, agentsObj.cod || 0, agentsObj.gmi || 0) +
                  '<span class="card-agent-count">' + totalAgents + ' agent' + (totalAgents !== 1 ? 's' : '') + '</span>' +
                '</div>' +
              '</div>' +
              chevronSVG +
            '</div>' +
          '</div>' +
          '<div class="card-detail">' +
            '<div class="card-detail-inner">' +
              '<div class="card-detail-text">' + escapeHtml(t.detail || '') + '</div>' +
              rolesHTML +
              '<div class="card-spawn-form" onclick="event.stopPropagation()">' +
                '<div class="card-spawn-row">' +
                  '<input type="text" placeholder="Session name..." id="tname-' + t.id + '">' +
                  '<input type="text" placeholder="Project path..." id="tpath-' + t.id + '">' +
                '</div>' +
                '<textarea class="card-spawn-textarea" placeholder="Initial prompt (optional)..." id="tprompt-' + t.id + '"></textarea>' +
                '<div class="card-spawn-row">' +
                  '<button class="btn btn-create btn-sm" onclick="spawnTemplate(\\'' + t.id + '\\')">Spawn</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>';
        grid.appendChild(div);
      });
    }

    // ---- Render session card ----
    function renderSessionCard(s) {
      var statusClass = s.attached ? 'badge-attached' : 'badge-detached';
      var statusText = s.attached ? 'attached' : 'detached';
      var processClass = getProcessBadgeClass(s.process);
      var processLabel = getProcessLabel(s.process);
      var created = new Date(s.created * 1000).toLocaleTimeString();
      var ac = s.agentCounts || { claude: 0, codex: 0, gemini: 0 };
      var hasAgents = ac.claude + ac.codex + ac.gemini > 0;
      var paneCount = s.paneCount || 1;

      var div = document.createElement('div');
      div.className = 'session fade-in';
      div.dataset.name = s.name;
      div.onclick = function() { window.open(s.url, '_blank'); };

      var agentsRow = '';
      if (hasAgents) {
        agentsRow = '<div class="session-agents">' + agentPillsHTML(ac.claude, ac.codex, ac.gemini) + '</div>';
      }

      var sendRow = '';
      if (s.isNtmSession || paneCount > 1) {
        sendRow =
          '<div class="session-send" onclick="event.stopPropagation()">' +
            '<input type="text" placeholder="Send prompt..." id="send-' + escapeHtml(s.name) + '" onkeydown="if(event.key===\\'Enter\\')sendToSession(\\'' + escapeHtml(s.name) + '\\')">' +
            '<select id="target-' + escapeHtml(s.name) + '">' +
              '<option value="all">All</option>' +
              '<option value="cc">Claude</option>' +
              '<option value="cod">Codex</option>' +
              '<option value="gmi">Gemini</option>' +
            '</select>' +
            '<button class="btn btn-send" onclick="sendToSession(\\'' + escapeHtml(s.name) + '\\')">Send</button>' +
            '<button class="btn btn-interrupt" onclick="interruptSession(\\'' + escapeHtml(s.name) + '\\')">Ctrl-C</button>' +
          '</div>';
      }

      div.innerHTML =
        '<div class="session-header">' +
          '<span class="session-name">' + escapeHtml(s.name) + '</span>' +
          '<div class="session-badges">' +
            '<span class="badge ' + processClass + '">' + escapeHtml(processLabel) + '</span>' +
            (paneCount > 1 ? '<span class="badge badge-process">' + paneCount + ' panes</span>' : '') +
            '<span class="badge ' + statusClass + '">' + statusText + '</span>' +
          '</div>' +
        '</div>' +
        agentsRow +
        '<div class="session-meta">' +
          s.windows + ' window' + (s.windows !== 1 ? 's' : '') + ' &middot; created ' + created +
        '</div>' +
        '<div class="session-actions">' +
          '<a href="' + s.url + '" target="_blank" class="btn btn-open btn-sm" onclick="event.stopPropagation()">Open Terminal</a>' +
          '<button onclick="event.stopPropagation(); deleteSession(\\'' + escapeHtml(s.name) + '\\')" class="btn btn-kill btn-sm">Kill</button>' +
        '</div>' +
        sendRow;
      return div;
    }

    function renderEmpty() {
      var div = document.createElement('div');
      div.className = 'empty';
      div.id = 'emptyState';
      div.innerHTML = '<p>No sessions running</p><p>Create one above to get started</p>';
      return div;
    }

    // ---- Dashboard update (AJAX polling) ----
    function updateDashboard(newSessions) {
      var grid = document.getElementById('sessionsGrid');
      var oldMap = {};
      currentSessions.forEach(function(s) { oldMap[s.name] = s; });
      var newMap = {};
      newSessions.forEach(function(s) { newMap[s.name] = s; });

      // Remove sessions that no longer exist
      var toRemove = [];
      currentSessions.forEach(function(s) {
        if (!newMap[s.name]) toRemove.push(s.name);
      });
      toRemove.forEach(function(name) {
        var el = grid.querySelector('[data-name="' + name + '"]');
        if (el) {
          el.classList.add('fade-out');
          setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 250);
        }
      });

      // Update existing or add new
      newSessions.forEach(function(s) {
        var existing = grid.querySelector('[data-name="' + s.name + '"]');
        if (existing) {
          var old = oldMap[s.name];
          if (old && (old.attached !== s.attached || old.windows !== s.windows || old.process !== s.process || old.processLabel !== s.processLabel || old.paneCount !== s.paneCount)) {
            // Preserve send input value before replacing
            var sendInput = document.getElementById('send-' + s.name);
            var sendVal = sendInput ? sendInput.value : '';
            var targetSel = document.getElementById('target-' + s.name);
            var targetVal = targetSel ? targetSel.value : 'all';

            var card = renderSessionCard(s);
            card.classList.remove('fade-in');
            existing.replaceWith(card);

            // Restore send input value
            var newSendInput = document.getElementById('send-' + s.name);
            if (newSendInput && sendVal) newSendInput.value = sendVal;
            var newTargetSel = document.getElementById('target-' + s.name);
            if (newTargetSel && targetVal) newTargetSel.value = targetVal;
          }
        } else {
          var empty = document.getElementById('emptyState');
          if (empty) empty.remove();
          grid.appendChild(renderSessionCard(s));
        }
      });

      // Show empty state if needed
      if (newSessions.length === 0 && !document.getElementById('emptyState')) {
        grid.appendChild(renderEmpty());
      }

      var countEl = document.getElementById('sessionCount');
      if (countEl) {
        countEl.textContent = '\\u00b7 ' + newSessions.length + ' session' + (newSessions.length !== 1 ? 's' : '') + ' active';
      }

      currentSessions = newSessions;
    }

    function setConnected(ok) {
      var dot = document.getElementById('statusDot');
      if (ok) {
        dot.className = 'status-dot';
        dot.title = 'Connected';
        pollFailures = 0;
      } else {
        dot.className = 'status-dot disconnected';
        dot.title = 'Connection lost';
      }
    }

    async function pollSessions() {
      try {
        var res = await fetch('/api/sessions');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        setConnected(true);
        updateDashboard(data);
      } catch (e) {
        pollFailures++;
        if (pollFailures >= 2) setConnected(false);
      }
    }

    // ---- Session CRUD ----
    async function createSession() {
      var input = document.getElementById('newSession');
      var name = input.value.trim();
      if (!name) return showToast('Enter a session name', 'error');
      try {
        var res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name })
        });
        if (res.ok) {
          var data = await res.json();
          input.value = '';
          showToast('Session "' + name + '" created', 'success');
          window.open(data.url, '_blank');
          pollSessions();
        } else {
          var err = await res.json().catch(function() { return {}; });
          showToast(err.error || 'Failed to create session', 'error');
        }
      } catch (e) {
        showToast('Failed to create session', 'error');
      }
    }

    async function deleteSession(name) {
      if (!confirm('Kill session "' + name + '"?')) return;
      try {
        await fetch('/api/sessions/' + encodeURIComponent(name), { method: 'DELETE' });
        showToast('Session "' + name + '" killed', 'success');
        pollSessions();
      } catch (e) {
        showToast('Failed to kill session', 'error');
      }
    }

    // ---- NTM spawn functions ----
    async function ntmSpawnRequest(body) {
      try {
        var res = await fetch('/api/ntm/spawn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        var data = await res.json();
        if (data.ok) {
          showToast('Spawned "' + body.name + '"', 'success');
          window.open(data.url, '_blank');
          pollSessions();
        } else {
          showToast(data.error || 'Spawn failed', 'error');
        }
      } catch (e) {
        showToast('Spawn request failed', 'error');
      }
    }

    function spawnRecipe(recipeId) {
      var nameInput = document.getElementById('rname-' + recipeId);
      var promptInput = document.getElementById('rprompt-' + recipeId);
      var name = (nameInput && nameInput.value.trim()) || genSessionName(recipeId);
      var prompt = promptInput ? promptInput.value.trim() : '';
      var recipe = RECIPES.find(function(r) { return r.id === recipeId; });
      var counters = recipeCounters[recipeId];
      var body;
      if (recipe && counters && (counters.cc !== recipe.cc || counters.cod !== recipe.cod || counters.gmi !== recipe.gmi)) {
        body = { name: name, cc: counters.cc, cod: counters.cod, gmi: counters.gmi };
      } else {
        body = { name: name, recipe: recipeId };
      }
      if (prompt) body.prompt = prompt;
      ntmSpawnRequest(body);
    }

    function spawnTemplate(templateId) {
      var nameInput = document.getElementById('tname-' + templateId);
      var promptInput = document.getElementById('tprompt-' + templateId);
      var name = (nameInput && nameInput.value.trim()) || genSessionName(templateId);
      var prompt = promptInput ? promptInput.value.trim() : '';
      var body = { name: name, template: templateId };
      if (prompt) body.prompt = prompt;
      ntmSpawnRequest(body);
    }

    function spawnCustom() {
      var name = document.getElementById('customName').value.trim() || genSessionName('custom');
      var prompt = document.getElementById('customPrompt').value.trim();
      var total = customCounts.cc + customCounts.cod + customCounts.gmi;
      if (total === 0) return showToast('Select at least one agent', 'error');
      var body = { name: name, cc: customCounts.cc, cod: customCounts.cod, gmi: customCounts.gmi };
      if (prompt) body.prompt = prompt;
      ntmSpawnRequest(body);
    }

    // ---- NTM send/interrupt ----
    async function sendToSession(name) {
      var input = document.getElementById('send-' + name);
      var select = document.getElementById('target-' + name);
      if (!input) return;
      var prompt = input.value.trim();
      if (!prompt) return showToast('Enter a prompt to send', 'error');
      var target = select ? select.value : 'all';
      try {
        var res = await fetch('/api/ntm/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session: name, prompt: prompt, target: target })
        });
        var data = await res.json();
        if (data.ok) {
          input.value = '';
          showToast('Sent to "' + name + '"', 'success');
        } else {
          showToast(data.error || 'Send failed', 'error');
        }
      } catch (e) {
        showToast('Send request failed', 'error');
      }
    }

    async function interruptSession(name) {
      if (!confirm('Interrupt all agents in "' + name + '"?')) return;
      try {
        var res = await fetch('/api/ntm/interrupt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session: name })
        });
        var data = await res.json();
        if (data.ok) {
          showToast('Interrupted "' + name + '"', 'success');
        } else {
          showToast(data.error || 'Interrupt failed', 'error');
        }
      } catch (e) {
        showToast('Interrupt request failed', 'error');
      }
    }

    // ---- Tools tab ----
    async function refreshToolStatus() {
      var grid = document.getElementById('toolGrid');
      if (!grid) return;
      grid.innerHTML = '<span style="color:#8b949e;font-size:0.75rem">Checking tools...</span>';
      try {
        var res = await fetch('/api/tools/status');
        var data = await res.json();
        renderToolGrid(data);
      } catch(e) {
        grid.innerHTML = '<span style="color:#f85149;font-size:0.75rem">Failed to load tool status</span>';
      }
    }

    function renderToolGrid(data) {
      var grid = document.getElementById('toolGrid');
      if (!grid) return;
      grid.innerHTML = '';
      var tools = Object.keys(data).sort(function(a, b) {
        if (data[a] !== data[b]) return data[b] ? 1 : -1;
        return a.localeCompare(b);
      });
      tools.forEach(function(t) {
        var pill = document.createElement('span');
        pill.className = 'tool-pill ' + (data[t] ? 'installed' : 'missing');
        pill.textContent = t;
        pill.title = data[t] ? 'Installed' : 'Not found';
        grid.appendChild(pill);
      });
    }

    function fmtBytes(b) {
      if (b >= 1073741824) return (b / 1073741824).toFixed(1) + ' GB';
      if (b >= 1048576) return (b / 1048576).toFixed(0) + ' MB';
      return (b / 1024).toFixed(0) + ' KB';
    }

    async function fetchSystemStats() {
      try {
        var res = await fetch('/api/tools/system');
        var data = await res.json();
        renderSystemStats(data);
      } catch(e) {}
    }

    function renderSystemStats(data) {
      var grid = document.getElementById('statsGrid');
      if (!grid) return;
      var cpuPct = data.cpu != null ? data.cpu.toFixed(1) + '%' : '--';
      var memUsed = data.memUsed != null ? fmtBytes(data.memUsed) : '?';
      var memTotal = data.memTotal != null ? fmtBytes(data.memTotal) : '?';
      var memPct = (data.memUsed && data.memTotal) ? ((data.memUsed / data.memTotal) * 100).toFixed(1) + '%' : '--';
      var diskUsed = data.diskUsed != null ? fmtBytes(data.diskUsed) : '?';
      var diskTotal = data.diskTotal != null ? fmtBytes(data.diskTotal) : '?';
      var diskPct = (data.diskUsed && data.diskTotal) ? ((data.diskUsed / data.diskTotal) * 100).toFixed(1) + '%' : '--';
      grid.innerHTML =
        '<div class="stat-card"><div class="stat-value">' + cpuPct + '</div><div class="stat-label">CPU Usage</div></div>' +
        '<div class="stat-card"><div class="stat-value">' + memPct + '</div><div class="stat-label">Memory ' + memUsed + ' / ' + memTotal + '</div></div>' +
        '<div class="stat-card"><div class="stat-value">' + diskPct + '</div><div class="stat-label">Disk ' + diskUsed + ' / ' + diskTotal + '</div></div>';
    }

    async function fetchEnvStatus() {
      try {
        var res = await fetch('/api/tools/env');
        var data = await res.json();
        renderEnvStatus(data);
      } catch(e) {}
    }

    function renderEnvStatus(data) {
      var grid = document.getElementById('envGrid');
      if (!grid) return;
      grid.innerHTML = '';
      var labels = { ANTHROPIC_API_KEY: 'Anthropic', OPENAI_API_KEY: 'OpenAI', GEMINI_API_KEY: 'Gemini', GH_TOKEN: 'GitHub' };
      Object.keys(data).forEach(function(key) {
        var item = document.createElement('div');
        item.className = 'env-item ' + (data[key] ? 'configured' : 'missing');
        item.innerHTML = '<span class="env-icon">' + (data[key] ? '\\u2713' : '\\u2717') + '</span> ' + escapeHtml(labels[key] || key);
        grid.appendChild(item);
      });
    }

    async function searchCASS() {
      var input = document.getElementById('cassQuery');
      var results = document.getElementById('cassResults');
      if (!input || !results) return;
      var query = input.value.trim();
      if (!query) return showToast('Enter a search query', 'error');
      results.innerHTML = '<div style="color:#8b949e;padding:0.5rem;font-size:0.75rem">Searching...</div>';
      try {
        var res = await fetch('/api/tools/cass', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: query })
        });
        var data = await res.json();
        if (data.error) {
          results.innerHTML = '<div style="color:#f85149;padding:0.5rem;font-size:0.75rem">' + escapeHtml(data.error) + '</div>';
        } else {
          renderCassResults(data);
        }
      } catch(e) {
        results.innerHTML = '<div style="color:#f85149;padding:0.5rem;font-size:0.75rem">Search failed</div>';
      }
    }

    function renderCassResults(data) {
      var results = document.getElementById('cassResults');
      if (!results) return;
      var items = Array.isArray(data) ? data : (data.results || data.snippets || []);
      if (items.length === 0 && data.raw) {
        results.innerHTML = '<pre style="color:#c9d1d9;font-size:0.7rem;white-space:pre-wrap;margin:0">' + escapeHtml(data.raw) + '</pre>';
        return;
      }
      if (items.length === 0) {
        results.innerHTML = '<div style="color:#8b949e;padding:0.5rem;font-size:0.75rem">No results found</div>';
        return;
      }
      results.innerHTML = '';
      items.slice(0, 50).forEach(function(item) {
        var div = document.createElement('div');
        div.className = 'result-item';
        var title = item.title || item.name || item.path || item.id || '';
        var snippet = item.snippet || item.content || item.description || '';
        if (!title && !snippet) title = JSON.stringify(item).substring(0, 100);
        div.innerHTML = (title ? '<div class="result-title">' + escapeHtml(String(title)) + '</div>' : '') +
          (snippet ? '<div class="result-snippet">' + escapeHtml(String(snippet).substring(0, 300)) + '</div>' : '');
        results.appendChild(div);
      });
    }

    async function fetchCAUT() {
      var results = document.getElementById('cautResults');
      if (!results) return;
      results.innerHTML = '<div style="color:#8b949e;padding:0.5rem;font-size:0.75rem">Loading usage data...</div>';
      try {
        var res = await fetch('/api/tools/caut');
        var data = await res.json();
        if (data.error) {
          results.innerHTML = '<div style="color:#f85149;padding:0.5rem;font-size:0.75rem">' + escapeHtml(data.error) + '</div>';
        } else {
          renderCautResults(data);
        }
      } catch(e) {
        results.innerHTML = '<div style="color:#f85149;padding:0.5rem;font-size:0.75rem">Failed to fetch usage</div>';
      }
    }

    function renderCautResults(data) {
      var results = document.getElementById('cautResults');
      if (!results) return;
      if (data.raw) {
        results.innerHTML = '<pre style="color:#c9d1d9;font-size:0.7rem;white-space:pre-wrap;margin:0">' + escapeHtml(data.raw) + '</pre>';
        return;
      }
      results.innerHTML = '';
      var entries = data.providers || data.usage || data;
      if (Array.isArray(entries)) {
        entries.forEach(function(e) {
          var div = document.createElement('div');
          div.className = 'result-item';
          div.innerHTML = '<div class="result-title">' + escapeHtml(e.provider || e.name || 'Provider') + '</div>' +
            '<div class="result-snippet">' + escapeHtml(String(e.usage || e.tokens || JSON.stringify(e))) + '</div>';
          results.appendChild(div);
        });
      } else if (typeof entries === 'object') {
        Object.keys(entries).forEach(function(key) {
          var div = document.createElement('div');
          div.className = 'result-item';
          var val = typeof entries[key] === 'object' ? JSON.stringify(entries[key]) : String(entries[key]);
          div.innerHTML = '<div class="result-title">' + escapeHtml(key) + '</div>' +
            '<div class="result-snippet">' + escapeHtml(val) + '</div>';
          results.appendChild(div);
        });
      } else {
        results.innerHTML = '<pre style="color:#c9d1d9;font-size:0.7rem;white-space:pre-wrap;margin:0">' + escapeHtml(JSON.stringify(data, null, 2)) + '</pre>';
      }
    }

    function initToolsTab() {
      refreshToolStatus();
      fetchSystemStats();
      fetchEnvStatus();
      if (!sysStatsTimer) {
        sysStatsTimer = setInterval(function() {
          var pane = document.getElementById('pane-tools');
          if (pane && pane.classList.contains('active')) {
            fetchSystemStats();
          }
        }, 10000);
      }
    }

    // ---- Init ----
    (function() {
      renderRecipes();
      renderTemplates();
      var grid = document.getElementById('sessionsGrid');
      if (currentSessions.length === 0) {
        grid.appendChild(renderEmpty());
      } else {
        currentSessions.forEach(function(s) {
          var card = renderSessionCard(s);
          card.classList.remove('fade-in');
          grid.appendChild(card);
        });
      }
    })();

    setInterval(pollSessions, 5000);
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
function checkAuth(req, res) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Basic ")) {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="ACFS"' });
    res.end("Unauthorized");
    return false;
  }
  const [user, pass] = Buffer.from(auth.split(" ")[1], "base64")
    .toString()
    .split(":");
  if (user !== TTYD_USER || pass !== TTYD_PASS) {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="ACFS"' });
    res.end("Unauthorized");
    return false;
  }
  return true;
}

function checkUpgradeAuth(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Basic ")) return false;
  const [user, pass] = Buffer.from(auth.split(" ")[1], "base64")
    .toString()
    .split(":");
  return user === TTYD_USER && pass === TTYD_PASS;
}

// ---------------------------------------------------------------------------
// JSON body parser helper
// ---------------------------------------------------------------------------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function jsonResponse(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// Main HTTP server
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Require basic auth for all routes
  if (!checkAuth(req, res)) return;

  // Dashboard
  if (url.pathname === "/" || url.pathname === "") {
    const sessions = getTmuxSessions();
    // Auto-start ttyd for any session that doesn't have one
    for (const s of sessions) {
      if (!instances.has(s.name)) {
        startTtydForSession(s.name);
      }
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(dashboardHTML(sessions));
    return;
  }

  // API: list sessions
  if (url.pathname === "/api/sessions" && req.method === "GET") {
    const sessions = getTmuxSessions();
    jsonResponse(res, 200, sessions);
    return;
  }

  // API: create session
  if (url.pathname === "/api/sessions" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { name } = JSON.parse(body);
        if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
          jsonResponse(res, 400, { error: "Invalid session name" });
          return;
        }
        ensureTmuxSession(name);
        const port = startTtydForSession(name);
        // Give ttyd a moment to start
        setTimeout(() => {
          jsonResponse(res, 201, { name, url: `/s/${name}/`, port });
        }, 500);
      } catch {
        jsonResponse(res, 400, { error: "Invalid request" });
      }
    });
    return;
  }

  // API: delete session
  const deleteMatch = url.pathname.match(/^\/api\/sessions\/([a-zA-Z0-9_-]+)$/);
  if (deleteMatch && req.method === "DELETE") {
    killSession(deleteMatch[1]);
    jsonResponse(res, 200, { ok: true });
    return;
  }

  // -----------------------------------------------------------------------
  // NTM API endpoints
  // -----------------------------------------------------------------------

  // NTM: spawn
  if (url.pathname === "/api/ntm/spawn" && req.method === "POST") {
    readBody(req)
      .then((body) => {
        const { name, recipe, template, cc, cod, gmi, prompt } = body;
        if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
          jsonResponse(res, 400, { error: "Invalid session name" });
          return;
        }
        const result = ntmSpawn(name, {
          recipe,
          template,
          cc,
          cod,
          gmi,
          prompt,
        });
        if (result.error) {
          jsonResponse(res, 500, result);
          return;
        }
        // Ensure tmux session and ttyd are ready so it appears on dashboard
        ensureTmuxSession(name);
        startTtydForSession(name);
        setTimeout(() => {
          jsonResponse(res, 201, result);
        }, 500);
      })
      .catch(() => {
        jsonResponse(res, 400, { error: "Invalid request body" });
      });
    return;
  }

  // NTM: send prompt
  if (url.pathname === "/api/ntm/send" && req.method === "POST") {
    readBody(req)
      .then((body) => {
        const { session, prompt, target } = body;
        if (!session || !prompt) {
          jsonResponse(res, 400, {
            error: "session and prompt are required",
          });
          return;
        }
        const result = ntmSend(session, prompt, target);
        if (result.error) {
          jsonResponse(res, 500, result);
        } else {
          jsonResponse(res, 200, result);
        }
      })
      .catch(() => {
        jsonResponse(res, 400, { error: "Invalid request body" });
      });
    return;
  }

  // NTM: interrupt
  if (url.pathname === "/api/ntm/interrupt" && req.method === "POST") {
    readBody(req)
      .then((body) => {
        const { session } = body;
        if (!session) {
          jsonResponse(res, 400, { error: "session is required" });
          return;
        }
        const result = ntmInterrupt(session);
        if (result.error) {
          jsonResponse(res, 500, result);
        } else {
          jsonResponse(res, 200, result);
        }
      })
      .catch(() => {
        jsonResponse(res, 400, { error: "Invalid request body" });
      });
    return;
  }

  // NTM: status
  const ntmStatusMatch = url.pathname.match(
    /^\/api\/ntm\/status\/([a-zA-Z0-9_-]+)$/
  );
  if (ntmStatusMatch && req.method === "GET") {
    const result = ntmStatus(ntmStatusMatch[1]);
    jsonResponse(res, result.error ? 500 : 200, result);
    return;
  }

  // -----------------------------------------------------------------------
  // Tools API endpoints
  // -----------------------------------------------------------------------

  if (url.pathname === "/api/tools/status" && req.method === "GET") {
    jsonResponse(res, 200, getToolStatus());
    return;
  }

  if (url.pathname === "/api/tools/system" && req.method === "GET") {
    jsonResponse(res, 200, getSystemStats());
    return;
  }

  if (url.pathname === "/api/tools/env" && req.method === "GET") {
    jsonResponse(res, 200, getEnvStatus());
    return;
  }

  if (url.pathname === "/api/tools/cass" && req.method === "POST") {
    readBody(req)
      .then((body) => {
        const { query } = body;
        if (!query) {
          jsonResponse(res, 400, { error: "query is required" });
          return;
        }
        try {
          const output = execSync(
            `su - ${ACFS_USER} -c ${shellEscape("cass search --json " + shellEscape(query))}`,
            { encoding: "utf8", timeout: 15000 }
          );
          try {
            jsonResponse(res, 200, JSON.parse(output.trim()));
          } catch {
            jsonResponse(res, 200, { raw: output.trim() });
          }
        } catch (e) {
          jsonResponse(res, 500, { error: e.message || "cass search failed" });
        }
      })
      .catch(() => {
        jsonResponse(res, 400, { error: "Invalid request body" });
      });
    return;
  }

  if (url.pathname === "/api/tools/caut" && req.method === "GET") {
    try {
      const output = execSync(
        `su - ${ACFS_USER} -c ${shellEscape("caut usage --json")}`,
        { encoding: "utf8", timeout: 10000 }
      );
      try {
        jsonResponse(res, 200, JSON.parse(output.trim()));
      } catch {
        jsonResponse(res, 200, { raw: output.trim() });
      }
    } catch (e) {
      jsonResponse(res, 500, { error: e.message || "caut usage failed" });
    }
    return;
  }

  // Proxy to ttyd session
  const sessionMatch = url.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)(\/.*)?$/);
  if (sessionMatch) {
    const sessionName = sessionMatch[1];
    ensureTmuxSession(sessionName);
    const port = startTtydForSession(sessionName);

    // Rewrite URL for ttyd (it expects its base path)
    proxyRequest(req, res, port);
    return;
  }

  // 404
  res.writeHead(404);
  res.end("Not found");
});

// Handle WebSocket upgrades (critical for ttyd and code-server)
server.on("upgrade", (req, socket, head) => {
  if (!checkUpgradeAuth(req)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  const sessionMatch = url.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)(\/.*)?$/);

  if (!sessionMatch) {
    socket.destroy();
    return;
  }

  const sessionName = sessionMatch[1];
  if (!instances.has(sessionName)) {
    socket.destroy();
    return;
  }

  const { port } = instances.get(sessionName);
  const options = {
    hostname: "127.0.0.1",
    port,
    path: req.url,
    method: "GET",
    headers: { ...req.headers, host: `127.0.0.1:${port}` },
  };

  const proxy = http.request(options);
  proxy.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
        Object.entries(proxyRes.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\r\n") +
        "\r\n\r\n"
    );
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });
  proxy.on("error", () => socket.destroy());
  proxy.end();
});

// Startup: create default "main" session
ensureTmuxSession("main");
startTtydForSession("main");

server.listen(PORT, () => {
  console.log(`ACFS Session Manager running on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/`);
  console.log(`Main terminal: http://localhost:${PORT}/s/main/`);
  console.log(`NTM available: ${isNtmAvailable()}`);
});
