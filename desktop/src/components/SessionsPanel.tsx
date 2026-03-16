import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "../api/client";
import { useTerminalStore } from "../store/terminals";
import type { SessionInfo, ProjectRecord } from "../api/types";

const AGENT_COLORS: Record<string, string> = {
  claude: "#bc8cff",
  codex: "#3fb950",
  gemini: "#58a6ff",
};

type SpawnMode = "quick" | "recipes" | "custom";

interface Recipe {
  id: string;
  name: string;
  desc: string;
  agents: string;
  cc: number;
  cod: number;
  gmi: number;
}

const RECIPES: Recipe[] = [
  { id: "minimal", name: "Single Agent", desc: "1 Claude for focused work", agents: "1x Claude", cc: 1, cod: 0, gmi: 0 },
  { id: "quick-claude", name: "Quick Start", desc: "2 Claude agents in parallel", agents: "2x Claude", cc: 2, cod: 0, gmi: 0 },
  { id: "full-stack", name: "Full Stack", desc: "Multi-model coverage", agents: "3C + 2X + 1G", cc: 3, cod: 2, gmi: 1 },
  { id: "balanced", name: "Balanced", desc: "Equal representation", agents: "2C + 2X + 2G", cc: 2, cod: 2, gmi: 2 },
  { id: "codex-heavy", name: "Codex Focus", desc: "Codex-led with Claude oversight", agents: "1C + 4X", cc: 1, cod: 4, gmi: 0 },
  { id: "review-team", name: "Code Review", desc: "2 reviewers + 1 implementer", agents: "2C + 1X", cc: 2, cod: 1, gmi: 0 },
];

export function SessionsPanel() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [spawnMode, setSpawnMode] = useState<SpawnMode>("quick");
  const [newName, setNewName] = useState("");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [customCc, setCustomCc] = useState(1);
  const [customCod, setCustomCod] = useState(0);
  const [customGmi, setCustomGmi] = useState(0);
  const [customPrompt, setCustomPrompt] = useState("");
  const [spawning, setSpawning] = useState(false);
  const { openTab, tabs } = useTerminalStore();
  const openSessionNames = new Set(tabs.map((t) => t.sessionName));

  const refresh = async () => {
    try {
      const data = await apiGet<SessionInfo[]>("/api/sessions");
      setSessions(data);
    } catch {}
  };

  const refreshProjects = async () => {
    try {
      const data = await apiGet<ProjectRecord[]>("/api/pm/projects?status=active");
      setProjects(data);
    } catch {
      // PM API may not be deployed yet
    }
  };

  useEffect(() => {
    refresh();
    refreshProjects();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);

  const projectPath = selectedProject
    ? projects.find((p) => p.name === selectedProject)?.path
    : undefined;

  const createQuickSession = async () => {
    const name = newName.trim();
    if (!name) return;
    setSpawning(true);
    try {
      await apiPost("/api/sessions", { name });
      setNewName("");
      await refresh();
      openTab(name, projectPath);
      // Attach project in PM if selected
      if (selectedProject) {
        const proj = projects.find((p) => p.name === selectedProject);
        if (proj) {
          try { await apiPost(`/api/pm/projects/${proj.id}/sessions/${name}`); } catch {}
        }
      }
    } catch {} finally {
      setSpawning(false);
    }
  };

  const spawnNtm = async (recipe?: string, cc?: number, cod?: number, gmi?: number) => {
    const name = newName.trim();
    if (!name) return;
    setSpawning(true);
    try {
      await apiPost("/api/ntm/spawn", {
        name,
        recipe,
        cc: recipe ? undefined : cc,
        cod: recipe ? undefined : cod,
        gmi: recipe ? undefined : gmi,
        prompt: customPrompt || undefined,
        projectPath,
      });
      setNewName("");
      setCustomPrompt("");
      await refresh();
      openTab(name, projectPath);
      if (selectedProject) {
        const proj = projects.find((p) => p.name === selectedProject);
        if (proj) {
          try { await apiPost(`/api/pm/projects/${proj.id}/sessions/${name}`); } catch {}
        }
      }
    } catch {} finally {
      setSpawning(false);
    }
  };

  const deleteSession = async (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    if (openSessionNames.has(name)) return;
    await apiDelete(`/api/sessions/${name}`);
    refresh();
  };

  return (
    <div className="sessions-panel">
      <h3>Sessions</h3>

      {/* Project selector */}
      <div className="spawn-section">
        <label className="spawn-label">Project</label>
        <select
          className="spawn-select"
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
        >
          <option value="">None (default dir)</option>
          {projects.map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Session name */}
      <div className="spawn-section">
        <label className="spawn-label">Session name</label>
        <input
          className="spawn-input"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={selectedProject || "my-session"}
          onKeyDown={(e) => e.key === "Enter" && spawnMode === "quick" && createQuickSession()}
        />
      </div>

      {/* Mode tabs */}
      <div className="spawn-mode-tabs">
        {(["quick", "recipes", "custom"] as const).map((m) => (
          <button
            key={m}
            className={`spawn-mode-btn ${spawnMode === m ? "active" : ""}`}
            onClick={() => setSpawnMode(m)}
          >
            {m === "quick" ? "Quick" : m === "recipes" ? "Recipes" : "Custom"}
          </button>
        ))}
      </div>

      {/* Quick mode */}
      {spawnMode === "quick" && (
        <button
          className="spawn-btn"
          onClick={createQuickSession}
          disabled={spawning || !newName.trim()}
        >
          {spawning ? "Creating..." : "+ New Session"}
        </button>
      )}

      {/* Recipes mode */}
      {spawnMode === "recipes" && (
        <div className="recipe-grid">
          {RECIPES.map((r) => (
            <button
              key={r.id}
              className="recipe-card"
              onClick={() => spawnNtm(r.id)}
              disabled={spawning || !newName.trim()}
              title={r.desc}
            >
              <span className="recipe-name">{r.name}</span>
              <span className="recipe-agents">{r.agents}</span>
            </button>
          ))}
        </div>
      )}

      {/* Custom mode */}
      {spawnMode === "custom" && (
        <div className="custom-spawn">
          <div className="agent-counters">
            <div className="agent-counter">
              <span className="agent-label" style={{ color: AGENT_COLORS.claude }}>Claude</span>
              <div className="counter-controls">
                <button onClick={() => setCustomCc(Math.max(0, customCc - 1))}>-</button>
                <span>{customCc}</span>
                <button onClick={() => setCustomCc(customCc + 1)}>+</button>
              </div>
            </div>
            <div className="agent-counter">
              <span className="agent-label" style={{ color: AGENT_COLORS.codex }}>Codex</span>
              <div className="counter-controls">
                <button onClick={() => setCustomCod(Math.max(0, customCod - 1))}>-</button>
                <span>{customCod}</span>
                <button onClick={() => setCustomCod(customCod + 1)}>+</button>
              </div>
            </div>
            <div className="agent-counter">
              <span className="agent-label" style={{ color: AGENT_COLORS.gemini }}>Gemini</span>
              <div className="counter-controls">
                <button onClick={() => setCustomGmi(Math.max(0, customGmi - 1))}>-</button>
                <span>{customGmi}</span>
                <button onClick={() => setCustomGmi(customGmi + 1)}>+</button>
              </div>
            </div>
          </div>
          <textarea
            className="spawn-prompt"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Initial prompt (optional)..."
            rows={2}
          />
          <button
            className="spawn-btn"
            onClick={() => spawnNtm(undefined, customCc, customCod, customGmi)}
            disabled={spawning || !newName.trim() || (customCc + customCod + customGmi === 0)}
          >
            {spawning ? "Spawning..." : "Spawn Team"}
          </button>
        </div>
      )}

      {/* Active sessions list */}
      <div className="session-divider">Active Sessions</div>
      <div className="session-list">
        {sessions.map((s) => {
          const isOpen = openSessionNames.has(s.name);
          const hasAgents = s.agentCounts.claude + s.agentCounts.codex + s.agentCounts.gemini > 0;
          return (
            <div
              key={s.name}
              className={`session-item ${isOpen ? "open" : ""}`}
              onClick={() => openTab(s.name)}
            >
              <div className="session-main">
                <div className="session-header">
                  {isOpen && <span className="open-dot" />}
                  <span className="session-name">{s.name}</span>
                </div>
                <div className="session-indicators">
                  <span className="ind proc">{s.processLabel}</span>
                  {s.paneCount > 1 && <span className="ind panes">{s.paneCount}p</span>}
                  {s.windows > 1 && <span className="ind wins">{s.windows}w</span>}
                  {s.attached > 0 && <span className="ind attached" title="Attached">●</span>}
                  {hasAgents && (
                    <span className="ind agents">
                      {s.agentCounts.claude > 0 && (
                        <span style={{ color: AGENT_COLORS.claude }}>
                          C{s.agentCounts.claude > 1 ? s.agentCounts.claude : ""}
                        </span>
                      )}
                      {s.agentCounts.codex > 0 && (
                        <span style={{ color: AGENT_COLORS.codex }}>
                          X{s.agentCounts.codex > 1 ? s.agentCounts.codex : ""}
                        </span>
                      )}
                      {s.agentCounts.gemini > 0 && (
                        <span style={{ color: AGENT_COLORS.gemini }}>
                          G{s.agentCounts.gemini > 1 ? s.agentCounts.gemini : ""}
                        </span>
                      )}
                    </span>
                  )}
                  {s.isNtmSession && <span className="ind ntm">ntm</span>}
                </div>
              </div>
              {!isOpen && (
                <button className="delete-btn" onClick={(e) => deleteSession(e, s.name)} title="Kill session">×</button>
              )}
            </div>
          );
        })}
        {sessions.length === 0 && <div className="empty">No sessions</div>}
      </div>
    </div>
  );
}
