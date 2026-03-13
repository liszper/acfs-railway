import { ACFS_HOSTNAME, CODE_SERVER_URL, CODE_SERVER_AVAILABLE } from "../config.js";
import { PROCESS_LABELS, NTM_RECIPES, NTM_TEMPLATES } from "./data.js";
import { getStyles } from "./styles.js";
import { getScripts } from "./scripts.js";
import type { SessionInfo } from "../types.js";

export function dashboardHTML(sessions: SessionInfo[]): string {
  const recipesJSON = JSON.stringify(NTM_RECIPES);
  const templatesJSON = JSON.stringify(NTM_TEMPLATES);
  const processLabelsJSON = JSON.stringify(PROCESS_LABELS);
  const sessionsJSON = JSON.stringify(sessions);

  const codeServerLink = CODE_SERVER_AVAILABLE
    ? `<a href="${CODE_SERVER_URL}" target="_blank" class="btn btn-code">VS Code</a>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${ACFS_HOSTNAME} — ACFS Session Dashboard</title>
<style>
${getStyles()}
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

  <div class="spawn-panel">
    <div class="spawn-tabs">
      <button class="spawn-tab active" data-tab="quick" onclick="switchTab('quick')">Quick Session</button>
      <button class="spawn-tab" data-tab="recipes" onclick="switchTab('recipes')">Recipes</button>
      <button class="spawn-tab" data-tab="templates" onclick="switchTab('templates')">Workflows</button>
      <button class="spawn-tab" data-tab="custom" onclick="switchTab('custom')">Custom</button>
      <button class="spawn-tab" data-tab="tools" onclick="switchTab('tools')">Tools</button>
    </div>
    <div class="spawn-body">

      <div class="spawn-pane active" id="pane-quick">
        <div class="quick-row">
          <input type="text" id="newSession" placeholder="Session name..." style="width:220px" onkeydown="if(event.key==='Enter')createSession()">
          <button class="btn btn-create" onclick="createSession()">+ New Session</button>
          ${codeServerLink}
        </div>
      </div>

      <div class="spawn-pane" id="pane-recipes">
        <div class="card-grid" id="recipeGrid"></div>
      </div>

      <div class="spawn-pane" id="pane-templates">
        <div class="card-grid" id="templateGrid"></div>
      </div>

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

  <div class="section-label">Active Sessions</div>
  <div class="sessions" id="sessionsGrid">
  </div>

  <div class="toast" id="toast"></div>

  <script>
${getScripts(sessionsJSON, recipesJSON, templatesJSON, processLabelsJSON)}
  </script>
</body>
</html>`;
}
