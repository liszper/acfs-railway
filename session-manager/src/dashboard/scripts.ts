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
    var sysStatsTimer = null;

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
  `;
}
