import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "../api/client";
import { useTerminalStore } from "../store/terminals";
import type { SessionInfo } from "../api/types";

const AGENT_COLORS: Record<string, string> = {
  claude: "#bc8cff",
  codex: "#3fb950",
  gemini: "#58a6ff",
};

export function SessionsPanel() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [newName, setNewName] = useState("");
  const { openTab, tabs } = useTerminalStore();
  const openSessionNames = new Set(tabs.map((t) => t.sessionName));

  const refresh = async () => {
    try {
      const data = await apiGet<SessionInfo[]>("/api/sessions");
      setSessions(data);
    } catch {}
  };

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);

  const createSession = async () => {
    if (!newName.trim()) return;
    await apiPost("/api/sessions", { name: newName.trim() });
    setNewName("");
    refresh();
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
      <div className="create-row">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Session name..."
          onKeyDown={(e) => e.key === "Enter" && createSession()}
        />
        <button onClick={createSession}>+</button>
      </div>
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
                <button className="delete-btn" onClick={(e) => deleteSession(e, s.name)} title="Kill session">
                  ×
                </button>
              )}
            </div>
          );
        })}
        {sessions.length === 0 && <div className="empty">No sessions</div>}
      </div>
    </div>
  );
}
