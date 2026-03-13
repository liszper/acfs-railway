#!/usr/bin/env node
// ACFS Session Manager
// Routes browser tabs to individual tmux sessions via ttyd instances
// GET /           → dashboard with all sessions
// GET /s/<name>   → ttyd terminal for that tmux session
// POST /api/sessions          → create a new session
// DELETE /api/sessions/<name> → kill a session
// GET /api/sessions           → list sessions as JSON

const http = require("http");
const { execSync, spawn } = require("child_process");
const path = require("path");

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
        return {
          name,
          windows: parseInt(windows) || 0,
          attached: parseInt(attached) || 0,
          created: parseInt(created) || 0,
          hasTerminal: instances.has(name),
          url: `/s/${name}/`,
          process,
          processLabel: PROCESS_LABELS[process] || process,
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

// Simple HTTP proxy to ttyd
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

function dashboardHTML(sessions) {
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

  .toolbar {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 2rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .toolbar input {
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
  .toolbar input:focus {
    border-color: #58a6ff;
  }
  .toolbar input::placeholder { color: #484f58; }

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
  .btn-create { background: #238636; color: #fff; border-color: #238636; }
  .btn-create:hover { background: #2ea043; }
  .btn-open { background: #1f6feb; color: #fff; border-color: #1f6feb; }
  .btn-open:hover { background: #388bfd; }
  .btn-kill { background: transparent; color: #f85149; border-color: #f85149; }
  .btn-kill:hover { background: rgba(248, 81, 73, 0.12); }
  .btn-code { background: #21262d; color: #c9d1d9; border-color: #30363d; }
  .btn-code:hover { background: #30363d; color: #f0f6fc; }

  .sessions {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
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

  .session-meta {
    color: #8b949e;
    font-size: 0.8rem;
    margin-bottom: 1rem;
  }
  .session-actions {
    display: flex;
    gap: 0.5rem;
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
</style>
</head>
<body>
  <div class="header">
    <h1>${ACFS_HOSTNAME}</h1>
    <span class="status-dot" id="statusDot" title="Connected"></span>
  </div>
  <p class="subtitle">
    ACFS Session Dashboard
    <span id="sessionCount">· ${sessions.length} session${sessions.length !== 1 ? "s" : ""} active</span>
  </p>

  <div class="toolbar">
    <input type="text" id="newSession" placeholder="New session name..." onkeydown="if(event.key==='Enter')createSession()">
    <button class="btn btn-create" onclick="createSession()">+ New Session</button>
    ${codeServerAvailable ? `<a href="${CODE_SERVER_URL}" target="_blank" class="btn btn-code">VS Code</a>` : ""}
  </div>

  <div class="sessions" id="sessionsGrid">
  </div>

  <script>
    let currentSessions = ${JSON.stringify(sessions)};
    let pollFailures = 0;

    const AGENT_PROCESSES = new Set(['claude', 'codex', 'gemini', 'opencode']);
    const SHELL_PROCESSES = new Set(['zsh', 'bash']);
    const PROCESS_LABELS = ${JSON.stringify(PROCESS_LABELS)};

    function getProcessBadgeClass(proc) {
      if (AGENT_PROCESSES.has(proc)) return 'badge-process agent';
      if (SHELL_PROCESSES.has(proc)) return 'badge-process shell';
      return 'badge-process';
    }

    function getProcessLabel(proc) {
      return PROCESS_LABELS[proc] || proc;
    }

    function renderSessionCard(s) {
      const statusClass = s.attached ? 'badge-attached' : 'badge-detached';
      const statusText = s.attached ? 'attached' : 'detached';
      const processClass = getProcessBadgeClass(s.process);
      const processLabel = getProcessLabel(s.process);
      const created = new Date(s.created * 1000).toLocaleTimeString();

      const div = document.createElement('div');
      div.className = 'session fade-in';
      div.dataset.name = s.name;
      div.onclick = function() { window.open(s.url, '_blank'); };
      div.innerHTML =
        '<div class="session-header">' +
          '<span class="session-name">' + escapeHtml(s.name) + '</span>' +
          '<div class="session-badges">' +
            '<span class="badge ' + processClass + '">' + escapeHtml(processLabel) + '</span>' +
            '<span class="badge ' + statusClass + '">' + statusText + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="session-meta">' +
          s.windows + ' window' + (s.windows !== 1 ? 's' : '') + ' &middot; created ' + created +
        '</div>' +
        '<div class="session-actions">' +
          '<a href="' + s.url + '" target="_blank" class="btn btn-open" onclick="event.stopPropagation()">Open Terminal</a>' +
          '<button onclick="event.stopPropagation(); deleteSession(\'' + escapeHtml(s.name) + '\')" class="btn btn-kill">Kill</button>' +
        '</div>';
      return div;
    }

    function renderEmpty() {
      const div = document.createElement('div');
      div.className = 'empty';
      div.id = 'emptyState';
      div.innerHTML = '<p>No sessions running</p><p>Create one to get started</p>';
      return div;
    }

    function escapeHtml(str) {
      const d = document.createElement('div');
      d.textContent = str;
      return d.innerHTML;
    }

    function updateDashboard(newSessions) {
      const grid = document.getElementById('sessionsGrid');
      const oldMap = {};
      currentSessions.forEach(function(s) { oldMap[s.name] = s; });
      const newMap = {};
      newSessions.forEach(function(s) { newMap[s.name] = s; });

      // Remove sessions that no longer exist
      const toRemove = [];
      currentSessions.forEach(function(s) {
        if (!newMap[s.name]) toRemove.push(s.name);
      });
      toRemove.forEach(function(name) {
        const el = grid.querySelector('[data-name="' + name + '"]');
        if (el) {
          el.classList.add('fade-out');
          setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 250);
        }
      });

      // Update existing or add new
      newSessions.forEach(function(s) {
        const existing = grid.querySelector('[data-name="' + s.name + '"]');
        if (existing) {
          // Update in place if data changed
          const old = oldMap[s.name];
          if (old && (old.attached !== s.attached || old.windows !== s.windows || old.process !== s.process || old.processLabel !== s.processLabel)) {
            const card = renderSessionCard(s);
            card.classList.remove('fade-in'); // no animation for updates
            existing.replaceWith(card);
          }
        } else {
          // New session - add with fade-in
          const empty = document.getElementById('emptyState');
          if (empty) empty.remove();
          grid.appendChild(renderSessionCard(s));
        }
      });

      // Show empty state if needed
      if (newSessions.length === 0 && !document.getElementById('emptyState')) {
        grid.appendChild(renderEmpty());
      }

      // Update session count
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
        const res = await fetch('/api/sessions');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        setConnected(true);
        updateDashboard(data);
      } catch (e) {
        pollFailures++;
        if (pollFailures >= 2) setConnected(false);
      }
    }

    (function() {
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

    async function createSession() {
      var input = document.getElementById('newSession');
      var name = input.value.trim();
      if (!name) return alert('Enter a session name');
      try {
        var res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name })
        });
        if (res.ok) {
          var data = await res.json();
          input.value = '';
          window.open(data.url, '_blank');
          pollSessions();
        } else {
          var err = await res.json().catch(function() { return {}; });
          alert(err.error || 'Failed to create session');
        }
      } catch (e) {
        alert('Failed to create session');
      }
    }

    async function deleteSession(name) {
      if (!confirm('Kill session "' + name + '"?')) return;
      try {
        await fetch('/api/sessions/' + encodeURIComponent(name), { method: 'DELETE' });
        pollSessions();
      } catch (e) {
        alert('Failed to delete session');
      }
    }
  </script>
</body>
</html>`;
}

// Basic auth check
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

// Main HTTP server
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
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(sessions));
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
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid session name" }));
          return;
        }
        ensureTmuxSession(name);
        const port = startTtydForSession(name);
        // Give ttyd a moment to start
        setTimeout(() => {
          res.writeHead(201, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ name, url: `/s/${name}/`, port }));
        }, 500);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid request" }));
      }
    });
    return;
  }

  // API: delete session
  const deleteMatch = url.pathname.match(/^\/api\/sessions\/([a-zA-Z0-9_-]+)$/);
  if (deleteMatch && req.method === "DELETE") {
    killSession(deleteMatch[1]);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // code-server runs on its own port (18080) with its own Railway domain

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
});
