import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "../api/client";
import { useTerminalStore } from "../store/terminals";
import type { SessionInfo, ProjectRecord } from "../api/types";

const AC: Record<string, string> = { claude: "#bc8cff", codex: "#3fb950", gemini: "#58a6ff" };

function ConfirmDialog({ message, actionLabel, onConfirm, onCancel }: {
  message: string; actionLabel: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="confirm-btn confirm-btn-danger" onClick={onConfirm}>{actionLabel}</button>
          <button className="confirm-btn confirm-btn-cancel" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function SessionDetail({ session, project, onClose }: {
  session: SessionInfo; project: ProjectRecord | null; onClose: () => void;
}) {
  const { openTab, tabs, closeTab } = useTerminalStore();
  const isOpen = tabs.some((t) => t.sessionName === session.name);
  const tab = tabs.find((t) => t.sessionName === session.name);
  const [confirmKill, setConfirmKill] = useState(false);
  const { claude, codex, gemini } = session.agentCounts;
  const totalAgents = claude + codex + gemini;

  const handleKill = async () => {
    if (tab) closeTab(tab.id);
    await apiDelete(`/api/sessions/${session.name}`);
    onClose();
  };

  return (
    <div className="sp-detail">
      {confirmKill && (
        <ConfirmDialog
          message={`Terminate session "${session.name}"? This will kill the tmux session and all processes running in it.`}
          actionLabel="Terminate"
          onConfirm={handleKill}
          onCancel={() => setConfirmKill(false)}
        />
      )}
      <div className="sp-detail-header">
        <span className="sp-detail-name">{session.name}</span>
        <button className="sp-detail-close" onClick={onClose}>×</button>
      </div>
      <div className="sp-detail-grid">
        <div className="sp-detail-row">
          <span className="sp-detail-label">Process</span>
          <span className="sp-detail-value">{session.processLabel}</span>
        </div>
        <div className="sp-detail-row">
          <span className="sp-detail-label">Panes</span>
          <span className="sp-detail-value">{session.paneCount}</span>
        </div>
        <div className="sp-detail-row">
          <span className="sp-detail-label">Windows</span>
          <span className="sp-detail-value">{session.windows}</span>
        </div>
        <div className="sp-detail-row">
          <span className="sp-detail-label">Attached</span>
          <span className="sp-detail-value">{session.attached > 0 ? "Yes" : "No"}</span>
        </div>
        {totalAgents > 0 && (
          <div className="sp-detail-row">
            <span className="sp-detail-label">Agents</span>
            <span className="sp-detail-value sp-detail-agents">
              {claude > 0 && <span style={{ color: AC.claude }}>Claude ×{claude}</span>}
              {codex > 0 && <span style={{ color: AC.codex }}>Codex ×{codex}</span>}
              {gemini > 0 && <span style={{ color: AC.gemini }}>Gemini ×{gemini}</span>}
            </span>
          </div>
        )}
        {session.isNtmSession && (
          <div className="sp-detail-row">
            <span className="sp-detail-label">NTM</span>
            <span className="sp-detail-value" style={{ color: "#bc8cff" }}>Managed</span>
          </div>
        )}
        <div className="sp-detail-row">
          <span className="sp-detail-label">Created</span>
          <span className="sp-detail-value">{new Date(session.created * 1000).toLocaleString()}</span>
        </div>
      </div>
      <div className="sp-detail-actions">
        {!isOpen ? (
          <button className="sp-detail-btn sp-detail-btn-open" onClick={() => openTab(session.name, project?.path)}>
            Open Terminal
          </button>
        ) : (
          <button className="sp-detail-btn sp-detail-btn-focus" onClick={() => {
            if (tab) useTerminalStore.getState().setActive(tab.id);
          }}>
            Focus Tab
          </button>
        )}
        <button className="sp-detail-btn sp-detail-btn-kill" onClick={() => setConfirmKill(true)}>
          Terminate Session
        </button>
      </div>
    </div>
  );
}

export function SessionsPanel() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const { openTab, tabs } = useTerminalStore();
  const openNames = new Set(tabs.map((t) => t.sessionName));

  const refresh = async () => {
    try { setSessions(await apiGet<SessionInfo[]>("/api/sessions")); } catch {}
  };
  const refreshProjects = async () => {
    try { setProjects(await apiGet<ProjectRecord[]>("/api/pm/projects?status=active")); } catch {}
  };

  useEffect(() => {
    refresh(); refreshProjects();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  // Group sessions by project
  const claimed = new Set<string>();
  const groups: { project: ProjectRecord | null; sessions: SessionInfo[] }[] = [];
  for (const p of projects) {
    const pLower = p.name.toLowerCase();
    const matching = sessions.filter((s) => {
      const sLower = s.name.toLowerCase();
      return sLower === pLower || sLower.startsWith(pLower + "-");
    });
    matching.forEach((s) => claimed.add(s.name));
    groups.push({ project: p, sessions: matching });
  }
  const unclaimed = sessions.filter((s) => !claimed.has(s.name));
  if (unclaimed.length > 0 || projects.length === 0) {
    groups.push({ project: null, sessions: unclaimed });
  }

  const createSession = async (name: string, project: ProjectRecord | null) => {
    await apiPost("/api/sessions", { name, cwd: project?.path });
    openTab(name, project?.path);
    if (project) {
      try { await apiPost(`/api/pm/projects/${project.id}/sessions/${name}`); } catch {}
    }
    // Refresh immediately, then again after a short delay to catch the new session
    await refresh();
    setTimeout(refresh, 1000);
  };

  // If a session is selected, show its detail view
  const selectedInfo = selectedSession ? sessions.find((s) => s.name === selectedSession) : null;
  const selectedProject = selectedSession
    ? projects.find((p) => selectedSession === p.name || selectedSession.startsWith(p.name + "-")) ?? null
    : null;

  if (selectedInfo) {
    return (
      <div className="sp">
        <SessionDetail
          session={selectedInfo}
          project={selectedProject}
          onClose={() => { setSelectedSession(null); refresh(); }}
        />
      </div>
    );
  }

  return (
    <div className="sp">
      {groups.map((g) => (
        <Group
          key={g.project?.name ?? "__other"}
          project={g.project}
          sessions={g.sessions}
          openNames={openNames}
          openTab={openTab}
          createSession={createSession}
          onSelect={setSelectedSession}
        />
      ))}
    </div>
  );
}

function Group({ project, sessions, openNames, openTab, createSession, onSelect }: {
  project: ProjectRecord | null;
  sessions: SessionInfo[];
  openNames: Set<string>;
  openTab: (name: string, path?: string) => Promise<void>;
  createSession: (name: string, project: ProjectRecord | null) => Promise<void>;
  onSelect: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try { await createSession(name, project); setAdding(false); setNewName(""); }
    catch {} finally { setBusy(false); }
  };

  return (
    <div className="sp-group">
      <div className="sp-group-header" onClick={() => setExpanded(!expanded)}>
        <span className="sp-chevron">{expanded ? "▾" : "▸"}</span>
        <span className="sp-group-name">{project ? project.name : "Other"}</span>
        <span className="sp-group-count">{sessions.length}</span>
        <button className="sp-add" onClick={(e) => {
          e.stopPropagation();
          setAdding(true);
          setNewName(project ? `${project.name}-` : "");
          setExpanded(true);
        }} title="New session">+</button>
      </div>

      {expanded && (
        <div className="sp-group-body">
          {adding && (
            <div className="sp-spawn-row">
              <input
                className="sp-spawn-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={project ? `${project.name}-task` : "session-name"}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setAdding(false); }}
                autoFocus
              />
              <button className="sp-spawn-go" onClick={handleCreate} disabled={!newName.trim() || busy}>
                {busy ? "..." : "Go"}
              </button>
              <button className="sp-spawn-cancel" onClick={() => setAdding(false)}>×</button>
            </div>
          )}

          {sessions.map((s) => {
            const isOpen = openNames.has(s.name);
            const { claude, codex, gemini } = s.agentCounts;
            const shortName = project && s.name.toLowerCase().startsWith(project.name.toLowerCase() + "-")
              ? s.name.slice(project.name.length + 1) : s.name;

            return (
              <div key={s.name} className={`sp-session ${isOpen ? "open" : ""}`}>
                <div className="sp-session-main" onClick={() => openTab(s.name, project?.path)}>
                  {isOpen && <span className="sp-dot" />}
                  <span className="sp-sname">{shortName}</span>
                  <span className="sp-indicators">
                    <span className="sp-proc">{s.processLabel}</span>
                    {s.paneCount > 1 && <span className="sp-badge">{s.paneCount}p</span>}
                    {claude > 0 && <span style={{ color: AC.claude }} className="sp-agent">C{claude > 1 ? claude : ""}</span>}
                    {codex > 0 && <span style={{ color: AC.codex }} className="sp-agent">X{codex > 1 ? codex : ""}</span>}
                    {gemini > 0 && <span style={{ color: AC.gemini }} className="sp-agent">G{gemini > 1 ? gemini : ""}</span>}
                    {s.isNtmSession && <span className="sp-badge sp-ntm">ntm</span>}
                  </span>
                </div>
                <button className="sp-info" onClick={(e) => { e.stopPropagation(); onSelect(s.name); }} title="Session details">i</button>
              </div>
            );
          })}

          {sessions.length === 0 && !adding && <div className="sp-empty">No sessions</div>}
        </div>
      )}
    </div>
  );
}
