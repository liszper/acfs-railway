import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "../api/client";
import { useTerminalStore } from "../store/terminals";
import type { SessionInfo } from "../api/types";

export function SessionsPanel() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [newName, setNewName] = useState("");
  const openTab = useTerminalStore((s) => s.openTab);

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

  const deleteSession = async (name: string) => {
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
        {sessions.map((s) => (
          <div key={s.name} className="session-item" onClick={() => openTab(s.name)}>
            <div className="session-name">{s.name}</div>
            <div className="session-meta">
              <span className="process-label">{s.processLabel}</span>
              {s.paneCount > 1 && <span className="pane-count">{s.paneCount} panes</span>}
            </div>
            <button
              className="delete-btn"
              onClick={(e) => { e.stopPropagation(); deleteSession(s.name); }}
            >
              ×
            </button>
          </div>
        ))}
        {sessions.length === 0 && <div className="empty">No sessions</div>}
      </div>
    </div>
  );
}
