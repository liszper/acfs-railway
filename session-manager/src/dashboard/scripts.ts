import type { SessionInfo } from "../types.js";

export function getScripts(
  sessionsJSON: string,
  recipesJSON: string,
  templatesJSON: string,
  processLabelsJSON: string
): string {
  return `
    var currentSessions = ${sessionsJSON};
    var pollFailures = 0;
    var customCounts = { cc: 1, cod: 0, gmi: 0 };
    var toolsTabLoaded = false;
    var secretsTabLoaded = false;
    var sysStatsTimer = null;
    var secretsRefreshTimer = null;
    var projectsTabLoaded = false;
    var selectedProject = null;
    var projectTreeState = {};
    var projectsRefreshTimer = null;
    var currentMode = 'quick';
    var spawnProjectsList = [];

    var RECIPES = ${recipesJSON};
    var TEMPLATES = ${templatesJSON};

    var AGENT_PROCESSES = { claude: true, codex: true, gemini: true, opencode: true };
    var SHELL_PROCESSES = { zsh: true, bash: true };
    var PROCESS_LABELS = ${processLabelsJSON};

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
      if (id === 'sessions') {
        loadProjectSelector();
      }
      if (id === 'tools' && !toolsTabLoaded) {
        toolsTabLoaded = true;
        initToolsTab();
      }
      if (id === 'secrets' && !secretsTabLoaded) {
        secretsTabLoaded = true;
        initSecretsTab();
      }
      if (id === 'projects' && !projectsTabLoaded) {
        projectsTabLoaded = true;
        initProjectsTab();
      }
    }

    function switchMode(mode) {
      currentMode = mode;
      var toggles = document.querySelectorAll('.mode-toggle');
      var contents = document.querySelectorAll('.mode-content');
      for (var i = 0; i < toggles.length; i++) {
        toggles[i].classList.toggle('active', toggles[i].dataset.mode === mode);
      }
      for (var j = 0; j < contents.length; j++) {
        contents[j].classList.toggle('active', contents[j].id === 'mode-' + mode);
      }
    }

    async function loadProjectSelector() {
      var select = document.getElementById('projectSelect');
      if (!select) return;
      try {
        var res = await fetch('/api/projects');
        var data = await res.json();
        spawnProjectsList = Array.isArray(data) ? data : [];
      } catch(e) {
        spawnProjectsList = [];
      }
      var currentVal = select.value;
      select.innerHTML = '<option value="">None</option>';
      spawnProjectsList.forEach(function(p) {
        var opt = document.createElement('option');
        opt.value = p.path;
        opt.textContent = p.name + (p.branch ? ' (' + p.branch + ')' : '');
        select.appendChild(opt);
      });
      if (currentVal) select.value = currentVal;
    }

    function onProjectSelect() {
      // no-op for now, the value is read at spawn time
    }

    function getSelectedProjectPath() {
      var select = document.getElementById('projectSelect');
      return select ? select.value : '';
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
      var pp = getSelectedProjectPath();
      if (pp) body.projectPath = pp;
      ntmSpawnRequest(body);
    }

    function spawnTemplate(templateId) {
      var nameInput = document.getElementById('tname-' + templateId);
      var promptInput = document.getElementById('tprompt-' + templateId);
      var name = (nameInput && nameInput.value.trim()) || genSessionName(templateId);
      var prompt = promptInput ? promptInput.value.trim() : '';
      var body = { name: name, template: templateId };
      if (prompt) body.prompt = prompt;
      var pp = getSelectedProjectPath();
      if (pp) body.projectPath = pp;
      ntmSpawnRequest(body);
    }

    function spawnCustom() {
      var name = document.getElementById('customName').value.trim() || genSessionName('custom');
      var prompt = document.getElementById('customPrompt').value.trim();
      var total = customCounts.cc + customCounts.cod + customCounts.gmi;
      if (total === 0) return showToast('Select at least one agent', 'error');
      var body = { name: name, cc: customCounts.cc, cod: customCounts.cod, gmi: customCounts.gmi };
      if (prompt) body.prompt = prompt;
      var pp = getSelectedProjectPath();
      if (pp) body.projectPath = pp;
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

    async function fetchSecretsStatus() {
      var container = document.getElementById('secretsContent');
      if (!container) return;
      try {
        var res = await fetch('/api/secrets/status');
        var data = await res.json();
        renderSecretsTab(data);
      } catch(e) {
        container.innerHTML = '<span style="color:#f85149;font-size:0.75rem">Failed to load secrets status</span>';
      }
    }

    function secretsPill(label, isSet) {
      return '<span class="secrets-pill ' + (isSet ? 'set' : 'unset') + '">' +
        '<span class="secrets-pill-icon">' + (isSet ? '\\u2713' : '\\u2717') + '</span> ' +
        escapeHtml(label) + '</span>';
    }

    function cliAuthCard(name, info) {
      var statusClass = !info.configured ? 'unconfigured' : (info.authenticated ? 'authenticated' : 'unauthenticated');
      var statusText = !info.configured ? 'No token' : (info.authenticated ? 'Authenticated' : 'Token set, not verified');
      var userText = info.user ? ' \\u2014 ' + escapeHtml(info.user) : '';
      return '<div class="secrets-cli-card ' + statusClass + '">' +
        '<div class="secrets-cli-name">' + escapeHtml(name) + '</div>' +
        '<div class="secrets-cli-status">' + statusText + userText + '</div>' +
      '</div>';
    }

    function renderSecretsTab(data) {
      var container = document.getElementById('secretsContent');
      if (!container) return;

      var html = '';

      html += '<div class="secrets-section"><div class="secrets-section-header">AI API Keys</div><div class="secrets-pills">';
      html += secretsPill('Anthropic', data.aiKeys.anthropic);
      html += secretsPill('OpenAI', data.aiKeys.openai);
      html += secretsPill('Gemini', data.aiKeys.gemini);
      html += '</div></div>';

      html += '<div class="secrets-section"><div class="secrets-section-header">GitHub &amp; Git</div>';
      html += '<div class="secrets-pills">';
      html += secretsPill('GH_TOKEN', data.github.token);
      html += secretsPill('SSH Key', data.github.sshKey);
      html += '</div>';
      html += '<div class="secrets-detail-grid">';
      html += '<div class="secrets-detail-item"><span class="secrets-detail-label">user.name</span><span class="secrets-detail-value">' + escapeHtml(data.github.gitName || 'not set') + '</span></div>';
      html += '<div class="secrets-detail-item"><span class="secrets-detail-label">user.email</span><span class="secrets-detail-value">' + escapeHtml(data.github.gitEmail || 'not set') + '</span></div>';
      html += '</div>';
      html += '<div class="secrets-form">';
      html += '<div class="secrets-form-row"><input type="text" id="gitName" placeholder="Git user.name..." value="' + escapeHtml(data.github.gitName || '') + '"><input type="text" id="gitEmail" placeholder="Git user.email..." value="' + escapeHtml(data.github.gitEmail || '') + '"><button class="btn btn-create btn-sm" onclick="saveGitConfig()">Save</button></div>';
      html += '</div></div>';

      html += '<div class="secrets-section"><div class="secrets-section-header"><span>Cloud CLIs</span>';
      if (data.cliAuthCacheAge !== null) {
        var ageSec = Math.round(data.cliAuthCacheAge / 1000);
        html += '<span class="secrets-cache-age">' + ageSec + 's ago</span>';
      }
      html += '<button class="btn btn-sm" onclick="refreshSecretsStatus()" style="font-size:0.65rem;padding:0.2rem 0.5rem">Refresh</button></div>';
      html += '<div class="secrets-cli-grid">';
      html += cliAuthCard('Railway', data.cloudCLIs.railway);
      html += cliAuthCard('Vercel', data.cloudCLIs.vercel);
      html += cliAuthCard('Supabase', data.cloudCLIs.supabase);
      html += cliAuthCard('Cloudflare', data.cloudCLIs.cloudflare);
      html += cliAuthCard('Vault', { configured: data.cloudCLIs.vault.configured, authenticated: false });
      html += '</div></div>';

      html += '<div class="secrets-section"><div class="secrets-section-header">SSH Keys</div>';
      html += '<div class="secrets-pills">';
      html += secretsPill('Private Key', data.ssh.hasPrivateKey);
      html += secretsPill('Public Key', data.ssh.hasPublicKey);
      if (data.ssh.source !== 'none') {
        html += '<span class="secrets-source-badge">' + escapeHtml(data.ssh.source) + '</span>';
      }
      html += '</div>';
      if (data.ssh.publicKey) {
        html += '<div class="secrets-pubkey-block">';
        html += '<div class="secrets-detail-item"><span class="secrets-detail-label">Fingerprint</span><span class="secrets-detail-value" style="font-size:0.7rem">' + escapeHtml(data.ssh.fingerprint || 'unknown') + '</span></div>';
        html += '<textarea class="secrets-pubkey" readonly onclick="this.select()">' + escapeHtml(data.ssh.publicKey) + '</textarea>';
        html += '<div class="secrets-form-row">';
        html += '<button class="btn btn-sm" onclick="copyPubKey()">Copy</button>';
        html += '<button class="btn btn-create btn-sm" onclick="uploadSshToGithub()">Upload to GitHub</button>';
        html += '<button class="btn btn-kill btn-sm" onclick="regenerateSshKey()">Regenerate</button>';
        html += '</div></div>';
      } else {
        html += '<div class="secrets-form-row" style="margin-top:0.5rem"><button class="btn btn-create btn-sm" onclick="generateSshKey()">Generate SSH Key</button></div>';
      }
      html += '</div>';

      html += '<div class="secrets-row">';

      html += '<div class="secrets-section"><div class="secrets-section-header">Container</div>';
      html += '<div class="secrets-detail-grid">';
      html += '<div class="secrets-detail-item"><span class="secrets-detail-label">User</span><span class="secrets-detail-value">' + escapeHtml(data.container.user) + '</span></div>';
      html += '<div class="secrets-detail-item"><span class="secrets-detail-label">Hostname</span><span class="secrets-detail-value">' + escapeHtml(data.container.hostname) + '</span></div>';
      html += '<div class="secrets-detail-item"><span class="secrets-detail-label">Terminal User</span><span class="secrets-detail-value">' + escapeHtml(data.terminal.user) + '</span></div>';
      html += '<div class="secrets-detail-item"><span class="secrets-detail-label">Password</span><span class="secrets-detail-value ' + (data.terminal.passwordDefault ? 'secrets-warn' : '') + '">' + (data.terminal.passwordDefault ? 'DEFAULT (changeme!)' : 'Custom') + '</span></div>';
      if (data.dotfiles.repo) {
        html += '<div class="secrets-detail-item"><span class="secrets-detail-label">Dotfiles</span><span class="secrets-detail-value">' + escapeHtml(data.dotfiles.repo) + '</span></div>';
      }
      html += '</div></div>';

      html += '<div class="secrets-section"><div class="secrets-section-header">Other</div>';
      html += '<div class="secrets-pills">';
      html += secretsPill('Webhook URL', data.webhooks.url);
      html += secretsPill('Webhook Secret', data.webhooks.secret);
      html += '</div>';
      html += '<div class="secrets-detail-grid">';
      if (data.agentLimits.memLimit) {
        html += '<div class="secrets-detail-item"><span class="secrets-detail-label">Mem Limit</span><span class="secrets-detail-value">' + escapeHtml(data.agentLimits.memLimit) + '</span></div>';
      }
      if (data.agentLimits.nproc) {
        html += '<div class="secrets-detail-item"><span class="secrets-detail-label">Max Procs</span><span class="secrets-detail-value">' + escapeHtml(data.agentLimits.nproc) + '</span></div>';
      }
      html += '</div>';
      var omoKeys = Object.keys(data.opencode);
      if (omoKeys.length > 0) {
        html += '<div class="secrets-pills" style="margin-top:0.5rem">';
        omoKeys.forEach(function(k) {
          var val = data.opencode[k];
          var isActive = val === 'yes' || val === 'max20';
          html += '<span class="secrets-omo-pill ' + (isActive ? 'active' : '') + '">' + escapeHtml(k.replace('OMO_', '')) + ': ' + escapeHtml(val) + '</span>';
        });
        html += '</div>';
      }
      html += '</div>';

      html += '</div>';

      container.innerHTML = html;
    }

    async function generateSshKey() {
      showToast('Generating SSH key...', '');
      try {
        var res = await fetch('/api/secrets/ssh/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        var data = await res.json();
        if (data.error) {
          showToast(data.error, 'error');
        } else {
          showToast('SSH key generated', 'success');
          fetchSecretsStatus();
        }
      } catch(e) {
        showToast('Failed to generate SSH key', 'error');
      }
    }

    async function regenerateSshKey() {
      if (!confirm('Regenerate SSH key? This will overwrite the existing key.')) return;
      showToast('Regenerating SSH key...', '');
      try {
        var res = await fetch('/api/secrets/ssh/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: true })
        });
        var data = await res.json();
        if (data.error) {
          showToast(data.error, 'error');
        } else {
          showToast('SSH key regenerated', 'success');
          fetchSecretsStatus();
        }
      } catch(e) {
        showToast('Failed to regenerate SSH key', 'error');
      }
    }

    async function uploadSshToGithub() {
      showToast('Uploading SSH key to GitHub...', '');
      try {
        var res = await fetch('/api/secrets/ssh/github', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        var data = await res.json();
        if (data.error) {
          showToast(data.error, 'error');
        } else {
          showToast('SSH key uploaded to GitHub', 'success');
          fetchSecretsStatus();
        }
      } catch(e) {
        showToast('Failed to upload SSH key', 'error');
      }
    }

    function copyPubKey() {
      var ta = document.querySelector('.secrets-pubkey');
      if (!ta) return;
      ta.select();
      try {
        navigator.clipboard.writeText(ta.value).then(function() {
          showToast('Public key copied', 'success');
        });
      } catch(e) {
        document.execCommand('copy');
        showToast('Public key copied', 'success');
      }
    }

    async function saveGitConfig() {
      var nameInput = document.getElementById('gitName');
      var emailInput = document.getElementById('gitEmail');
      var name = nameInput ? nameInput.value.trim() : '';
      var email = emailInput ? emailInput.value.trim() : '';
      if (!name && !email) return showToast('Enter a name or email', 'error');
      try {
        var res = await fetch('/api/secrets/git', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name || undefined, email: email || undefined })
        });
        var data = await res.json();
        if (data.error) {
          showToast(data.error, 'error');
        } else {
          showToast('Git config saved', 'success');
          fetchSecretsStatus();
        }
      } catch(e) {
        showToast('Failed to save git config', 'error');
      }
    }

    async function refreshSecretsStatus() {
      showToast('Refreshing...', '');
      await fetchSecretsStatus();
      showToast('Secrets status refreshed', 'success');
    }

    function initSecretsTab() {
      fetchSecretsStatus();
      if (!secretsRefreshTimer) {
        secretsRefreshTimer = setInterval(function() {
          var pane = document.getElementById('pane-secrets');
          if (pane && pane.classList.contains('active')) {
            fetchSecretsStatus();
          }
        }, 30000);
      }
    }

    // ---- Projects tab ----

    async function fetchProjects() {
      try {
        var res = await fetch('/api/projects');
        var data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch(e) {
        showToast('Failed to load projects', 'error');
        return [];
      }
    }

    function renderProjectCards(projects) {
      var container = document.getElementById('projectCards');
      if (!container) return;
      container.innerHTML = '';
      if (projects.length === 0) {
        container.innerHTML = '<div class="projects-empty">No projects found in /data/projects. Clone a repo to get started.</div>';
        return;
      }
      projects.forEach(function(p) {
        var card = document.createElement('div');
        card.className = 'project-card' + (selectedProject === p.name ? ' selected' : '');
        card.onclick = function() { selectProject(p.name); };

        var statsHtml = '';
        if (p.isGitRepo) {
          if (p.clean) {
            statsHtml = '<span class="stat-clean">clean</span>';
          } else {
            if (p.staged > 0) statsHtml += '<span class="stat-staged">+' + p.staged + ' staged</span>';
            if (p.modified > 0) statsHtml += '<span class="stat-modified">' + p.modified + ' modified</span>';
            if (p.untracked > 0) statsHtml += '<span class="stat-untracked">' + p.untracked + ' untracked</span>';
          }
        }

        var branchHtml = p.isGitRepo
          ? '<div class="project-card-branch"><span class="branch-icon">&#9741;</span>' + escHtml(p.branch || 'unknown') + '</div>'
          : '<div class="project-card-branch" style="color:#484f58">Not a git repo</div>';

        var aheadBehindHtml = '';
        if (p.isGitRepo && (p.ahead > 0 || p.behind > 0)) {
          var parts = [];
          if (p.ahead > 0) parts.push('<span class="ahead">&uarr;' + p.ahead + '</span>');
          if (p.behind > 0) parts.push('<span class="behind">&darr;' + p.behind + '</span>');
          aheadBehindHtml = '<div class="ahead-behind">' + parts.join(' ') + '</div>';
        }

        var remoteHtml = p.remoteUrl
          ? '<div class="project-card-remote">' + escHtml(p.remoteUrl) + '</div>'
          : '';

        card.innerHTML = '<div class="project-card-name">' + escHtml(p.name) + '</div>'
          + branchHtml
          + '<div class="project-card-stats">' + statsHtml + '</div>'
          + aheadBehindHtml
          + remoteHtml;

        container.appendChild(card);
      });
    }

    function escHtml(s) {
      var d = document.createElement('div');
      d.textContent = s || '';
      return d.innerHTML;
    }

    async function selectProject(name) {
      selectedProject = name;
      // re-highlight cards
      var cards = document.querySelectorAll('.project-card');
      for (var i = 0; i < cards.length; i++) {
        var cardName = cards[i].querySelector('.project-card-name');
        cards[i].classList.toggle('selected', cardName && cardName.textContent === name);
      }
      // show detail
      var detail = document.getElementById('projectDetail');
      if (detail) {
        detail.className = 'project-detail visible';
        detail.innerHTML = '<div class="projects-loading">Loading...</div>';
      }
      await loadProjectDetail(name);
    }

    async function loadProjectDetail(name) {
      try {
        var res = await fetch('/api/projects/' + encodeURIComponent(name) + '/detail');
        var data = await res.json();
        if (data.error) {
          showToast(data.error, 'error');
          return;
        }
        renderProjectDetail(data);
        loadFileTree(name, '');
        loadProjectLog(name);
      } catch(e) {
        showToast('Failed to load project detail', 'error');
      }
    }

    function renderProjectDetail(data) {
      var detail = document.getElementById('projectDetail');
      if (!detail) return;
      var info = data.info;
      var status = data.status;

      var html = '<div class="project-detail-header">'
        + '<div class="project-detail-title">' + escHtml(info.name) + ' &middot; <span style="color:#8b949e;font-weight:400">' + escHtml(info.branch || '') + '</span></div>'
        + '<div class="project-detail-actions">'
        + '<button class="btn btn-sm" onclick="pullProject()">Pull</button>'
        + '<button class="btn btn-sm" onclick="pushProject()">Push</button>'
        + '<button class="btn btn-sm" onclick="refreshProjectDetail()">Refresh</button>'
        + '</div>'
        + '</div>'
        + '<div class="project-detail-body">'
        + '<div><div class="changes-section-header">File Tree</div><div class="file-tree-container" id="fileTreeContainer"></div></div>'
        + '<div class="changes-panel">'
        + renderChangesPanel(status)
        + '</div>'
        + '</div>'
        + '<div class="commits-section"><div class="changes-section-header">Recent Commits</div><div id="commitLog"><span style="color:#484f58;font-size:0.75rem">Loading...</span></div></div>';

      detail.innerHTML = html;
    }

    function renderChangesPanel(status) {
      var html = '';
      // Staged
      html += '<div class="changes-section-header">Staged Changes (' + status.staged.length + ')</div>';
      if (status.staged.length > 0) {
        html += '<ul class="changes-list">';
        status.staged.forEach(function(f) {
          html += '<li><span class="change-status A">' + escHtml(f.status) + '</span>'
            + '<span class="change-path">' + escHtml(f.path) + '</span>'
            + '<span class="change-action" onclick="unstageFile(\\'' + escAttr(f.path) + '\\')">unstage</span>'
            + '<span class="change-action" onclick="viewDiff(\\'' + escAttr(f.path) + '\\', true)">diff</span>'
            + '</li>';
        });
        html += '</ul>';
      } else {
        html += '<div style="color:#484f58;font-size:0.75rem;margin-bottom:0.5rem">No staged changes</div>';
      }

      // Modified
      html += '<div class="changes-section-header">Changes (' + status.modified.length + ')</div>';
      if (status.modified.length > 0) {
        html += '<ul class="changes-list">';
        status.modified.forEach(function(f) {
          html += '<li><span class="change-status M">' + escHtml(f.status) + '</span>'
            + '<span class="change-path">' + escHtml(f.path) + '</span>'
            + '<span class="change-action" onclick="stageFile(\\'' + escAttr(f.path) + '\\')">stage</span>'
            + '<span class="change-action" onclick="viewDiff(\\'' + escAttr(f.path) + '\\', false)">diff</span>'
            + '</li>';
        });
        html += '</ul>';
      } else {
        html += '<div style="color:#484f58;font-size:0.75rem;margin-bottom:0.5rem">No modified files</div>';
      }

      // Untracked
      if (status.untracked.length > 0) {
        html += '<div class="changes-section-header">Untracked (' + status.untracked.length + ')</div>';
        html += '<ul class="changes-list">';
        status.untracked.forEach(function(f) {
          var fname = typeof f === 'string' ? f : f.path;
          html += '<li><span class="change-status untracked">?</span>'
            + '<span class="change-path">' + escHtml(fname) + '</span>'
            + '<span class="change-action" onclick="stageFile(\\'' + escAttr(fname) + '\\')">stage</span>'
            + '</li>';
        });
        html += '</ul>';
      }

      // Stage all + commit form
      html += '<div class="commit-form">'
        + '<div style="display:flex;gap:0.5rem;margin-bottom:0.5rem">'
        + '<button class="btn btn-sm" onclick="stageAllFiles()">Stage All</button>'
        + '</div>'
        + '<textarea id="commitMsg" placeholder="Commit message..." rows="2"></textarea>'
        + '<div class="commit-actions">'
        + '<button class="btn btn-create btn-sm" onclick="commitProject()">Commit</button>'
        + '</div>'
        + '</div>';

      return html;
    }

    function escAttr(s) {
      return (s || '').replace(/\\\\/g, '\\\\\\\\').replace(/\\'/g, "\\\\'");
    }

    // File tree (flat list, VSCode style)
    async function loadFileTree(name, subPath) {
      var container = document.getElementById('fileTreeContainer');
      if (!container) return;
      if (!subPath) {
        container.innerHTML = '<div class="projects-loading">Loading...</div>';
        projectTreeState = {};
      }
      try {
        var url = '/api/projects/' + encodeURIComponent(name) + '/tree';
        if (subPath) url += '?path=' + encodeURIComponent(subPath);
        var res = await fetch(url);
        var entries = await res.json();
        if (entries.error) {
          container.innerHTML = '<div class="projects-empty">' + escHtml(entries.error) + '</div>';
          return;
        }
        if (!subPath) {
          container.innerHTML = '';
          renderTreeEntries(container, entries, 0, '');
        } else {
          // insert children after parent row
          var parentKey = subPath;
          var parentRow = container.querySelector('[data-path="' + CSS.escape(parentKey) + '"]');
          if (parentRow) {
            // remove old children
            removeTreeChildren(container, parentKey);
            var depth = parseInt(parentRow.dataset.depth || '0', 10) + 1;
            var nextSibling = parentRow.nextSibling;
            entries.forEach(function(entry) {
              var row = createTreeRow(entry, depth, subPath);
              container.insertBefore(row, nextSibling);
            });
          }
        }
      } catch(e) {
        if (!subPath && container) {
          container.innerHTML = '<div class="projects-empty">Failed to load file tree</div>';
        }
      }
    }

    function renderTreeEntries(container, entries, depth, parentPath) {
      entries.forEach(function(entry) {
        var row = createTreeRow(entry, depth, parentPath);
        container.appendChild(row);
      });
    }

    function createTreeRow(entry, depth, parentPath) {
      var row = document.createElement('div');
      row.className = 'tree-row';
      row.style.paddingLeft = (8 + depth * 16) + 'px';
      var fullPath = parentPath ? parentPath + '/' + entry.name : entry.name;
      row.dataset.path = fullPath;
      row.dataset.depth = String(depth);
      row.dataset.isDir = entry.isDir ? '1' : '0';

      var twistie = '';
      var icon = '';
      if (entry.isDir) {
        var expanded = projectTreeState[fullPath];
        twistie = '<span class="twistie">' + (expanded ? '&#9660;' : '&#9654;') + '</span>';
        icon = '<span class="tree-icon dir">&#128193;</span>';
      } else {
        twistie = '<span class="twistie">&middot;</span>';
        icon = '<span class="tree-icon file">&#128196;</span>';
      }

      var statusBadge = '';
      if (entry.gitStatus) {
        var cls = entry.gitStatus === '??' ? 'untracked' : entry.gitStatus;
        statusBadge = '<span class="tree-status ' + cls + '">' + (entry.gitStatus === '??' ? '?' : entry.gitStatus) + '</span>';
      }

      row.innerHTML = twistie + icon + '<span class="tree-name">' + escHtml(entry.name) + '</span>' + statusBadge;

      row.addEventListener('click', function() {
        if (entry.isDir) {
          toggleTreeDir(fullPath);
        } else {
          // clicking a file shows its diff
          viewDiff(fullPath, false);
        }
      });

      return row;
    }

    function toggleTreeDir(path) {
      if (projectTreeState[path]) {
        projectTreeState[path] = false;
        var container = document.getElementById('fileTreeContainer');
        if (container) {
          removeTreeChildren(container, path);
          var row = container.querySelector('[data-path="' + CSS.escape(path) + '"]');
          if (row) {
            var tw = row.querySelector('.twistie');
            if (tw) tw.innerHTML = '&#9654;';
          }
        }
      } else {
        projectTreeState[path] = true;
        var container2 = document.getElementById('fileTreeContainer');
        if (container2) {
          var row2 = container2.querySelector('[data-path="' + CSS.escape(path) + '"]');
          if (row2) {
            var tw2 = row2.querySelector('.twistie');
            if (tw2) tw2.innerHTML = '&#9660;';
          }
        }
        loadFileTree(selectedProject, path);
      }
    }

    function removeTreeChildren(container, parentPath) {
      var rows = container.querySelectorAll('.tree-row');
      var prefix = parentPath + '/';
      for (var i = rows.length - 1; i >= 0; i--) {
        var rp = rows[i].dataset.path;
        if (rp && rp.indexOf(prefix) === 0) {
          rows[i].remove();
          delete projectTreeState[rp];
        }
      }
    }

    // Git operations
    async function stageFile(path) {
      if (!selectedProject) return;
      try {
        var res = await fetch('/api/projects/' + encodeURIComponent(selectedProject) + '/stage', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: [path] })
        });
        var data = await res.json();
        if (data.ok) {
          showToast('Staged: ' + path, 'success');
          await refreshProjectDetail();
        } else {
          showToast(data.error || 'Stage failed', 'error');
        }
      } catch(e) {
        showToast('Stage failed', 'error');
      }
    }

    async function unstageFile(path) {
      if (!selectedProject) return;
      try {
        var res = await fetch('/api/projects/' + encodeURIComponent(selectedProject) + '/unstage', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: [path] })
        });
        var data = await res.json();
        if (data.ok) {
          showToast('Unstaged: ' + path, 'success');
          await refreshProjectDetail();
        } else {
          showToast(data.error || 'Unstage failed', 'error');
        }
      } catch(e) {
        showToast('Unstage failed', 'error');
      }
    }

    async function stageAllFiles() {
      if (!selectedProject) return;
      try {
        var res = await fetch('/api/projects/' + encodeURIComponent(selectedProject) + '/stage-all', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        var data = await res.json();
        if (data.ok) {
          showToast('All files staged', 'success');
          await refreshProjectDetail();
        } else {
          showToast(data.error || 'Stage all failed', 'error');
        }
      } catch(e) {
        showToast('Stage all failed', 'error');
      }
    }

    async function commitProject() {
      if (!selectedProject) return;
      var msgEl = document.getElementById('commitMsg');
      var msg = msgEl ? msgEl.value.trim() : '';
      if (!msg) { showToast('Enter a commit message', 'error'); return; }
      try {
        var res = await fetch('/api/projects/' + encodeURIComponent(selectedProject) + '/commit', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg })
        });
        var data = await res.json();
        if (data.ok) {
          showToast('Committed: ' + (data.hash || '').slice(0, 7), 'success');
          if (msgEl) msgEl.value = '';
          await refreshProjectDetail();
        } else {
          showToast(data.error || 'Commit failed', 'error');
        }
      } catch(e) {
        showToast('Commit failed', 'error');
      }
    }

    async function pushProject() {
      if (!selectedProject) return;
      showToast('Pushing...', '');
      try {
        var res = await fetch('/api/projects/' + encodeURIComponent(selectedProject) + '/push', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        var data = await res.json();
        if (data.ok) {
          showToast('Pushed successfully', 'success');
          await refreshProjectDetail();
        } else {
          showToast(data.error || 'Push failed', 'error');
        }
      } catch(e) {
        showToast('Push failed', 'error');
      }
    }

    async function pullProject() {
      if (!selectedProject) return;
      showToast('Pulling...', '');
      try {
        var res = await fetch('/api/projects/' + encodeURIComponent(selectedProject) + '/pull', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        var data = await res.json();
        if (data.ok) {
          showToast('Pulled successfully', 'success');
          await refreshProjectDetail();
        } else {
          showToast(data.error || 'Pull failed', 'error');
        }
      } catch(e) {
        showToast('Pull failed', 'error');
      }
    }

    async function loadProjectLog(name) {
      try {
        var res = await fetch('/api/projects/' + encodeURIComponent(name) + '/log?limit=10');
        var entries = await res.json();
        var container = document.getElementById('commitLog');
        if (!container) return;
        if (entries.error) {
          container.innerHTML = '<span style="color:#484f58;font-size:0.75rem">' + escHtml(entries.error) + '</span>';
          return;
        }
        if (!Array.isArray(entries) || entries.length === 0) {
          container.innerHTML = '<span style="color:#484f58;font-size:0.75rem">No commits yet</span>';
          return;
        }
        var html = '';
        entries.forEach(function(c) {
          var dateStr = c.date ? new Date(c.date).toLocaleDateString() : '';
          html += '<div class="commit-row">'
            + '<span class="commit-hash">' + escHtml(c.shortHash) + '</span>'
            + '<span class="commit-msg">' + escHtml(c.message) + '</span>'
            + '<span class="commit-author">' + escHtml(c.author) + '</span>'
            + '<span class="commit-date">' + dateStr + '</span>'
            + '</div>';
        });
        container.innerHTML = html;
      } catch(e) {
        var el = document.getElementById('commitLog');
        if (el) el.innerHTML = '<span style="color:#484f58;font-size:0.75rem">Failed to load commits</span>';
      }
    }

    // Diff viewer
    async function viewDiff(filePath, staged) {
      if (!selectedProject) return;
      var qs = '?file=' + encodeURIComponent(filePath);
      if (staged) qs += '&staged=true';
      try {
        var res = await fetch('/api/projects/' + encodeURIComponent(selectedProject) + '/diff' + qs);
        var data = await res.json();
        if (data.error) {
          showToast(data.error, 'error');
          return;
        }
        var diffText = data.diff || '(empty diff)';
        var fileNameEl = document.getElementById('diffFileName');
        var contentEl = document.getElementById('diffContent');
        if (fileNameEl) fileNameEl.textContent = filePath + (staged ? ' (staged)' : '');
        if (contentEl) {
          // colorize diff lines
          var lines = diffText.split('\\n');
          var colored = lines.map(function(line) {
            if (line.indexOf('+') === 0 && line.indexOf('+++') !== 0) return '<span class="diff-add">' + escHtml(line) + '</span>';
            if (line.indexOf('-') === 0 && line.indexOf('---') !== 0) return '<span class="diff-del">' + escHtml(line) + '</span>';
            if (line.indexOf('@@') === 0) return '<span class="diff-hunk">' + escHtml(line) + '</span>';
            return escHtml(line);
          }).join('\\n');
          contentEl.innerHTML = colored;
        }
        var overlay = document.getElementById('diffOverlay');
        if (overlay) overlay.className = 'diff-overlay visible';
      } catch(e) {
        showToast('Failed to load diff', 'error');
      }
    }

    function closeDiffOverlay() {
      var overlay = document.getElementById('diffOverlay');
      if (overlay) overlay.className = 'diff-overlay';
    }

    // Clone
    async function cloneRepo() {
      var urlInput = document.getElementById('cloneUrl');
      var url = urlInput ? urlInput.value.trim() : '';
      if (!url) { showToast('Enter a repository URL', 'error'); return; }
      showToast('Cloning...', '');
      try {
        var res = await fetch('/api/projects/clone', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url })
        });
        var data = await res.json();
        if (data.ok) {
          showToast('Cloned: ' + data.name, 'success');
          if (urlInput) urlInput.value = '';
          await initProjectsTab();
        } else {
          showToast(data.error || 'Clone failed', 'error');
        }
      } catch(e) {
        showToast('Clone failed', 'error');
      }
    }

    async function refreshProjectDetail() {
      if (!selectedProject) return;
      await loadProjectDetail(selectedProject);
    }

    async function initProjectsTab() {
      var content = document.getElementById('projectsContent');
      if (!content) return;
      content.innerHTML = '<div class="projects-header">'
        + '<div class="projects-clone-form">'
        + '<input type="text" id="cloneUrl" placeholder="https://github.com/user/repo or user/repo" onkeydown="if(event.key===\\'Enter\\')cloneRepo()">'
        + '<button class="btn btn-create btn-sm" onclick="cloneRepo()">Clone</button>'
        + '<button class="btn btn-sm" onclick="initProjectsTab()">Refresh All</button>'
        + '</div>'
        + '</div>'
        + '<div class="project-cards" id="projectCards"><div class="projects-loading">Loading projects...</div></div>'
        + '<div class="project-detail" id="projectDetail"></div>';

      var projects = await fetchProjects();
      renderProjectCards(projects);

      if (!projectsRefreshTimer) {
        projectsRefreshTimer = setInterval(function() {
          var pane = document.getElementById('pane-projects');
          if (pane && pane.classList.contains('active') && !selectedProject) {
            fetchProjects().then(function(p) { renderProjectCards(p); });
          }
        }, 15000);
      }
    }

    (function() {
      renderRecipes();
      renderTemplates();
      loadProjectSelector();
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
  `;
}
