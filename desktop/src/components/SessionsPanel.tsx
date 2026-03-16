import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "../api/client";
import { useTerminalStore } from "../store/terminals";
import type { SessionInfo, ProjectRecord } from "../api/types";

const AC: Record<string, string> = { claude: "#bc8cff", codex: "#3fb950", gemini: "#58a6ff" };

export function SessionsPanel() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
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
    const matching = sessions.filter((s) => s.name === p.name || s.name.startsWith(p.name + "-"));
    matching.forEach((s) => claimed.add(s.name));
    groups.push({ project: p, sessions: matching });
  }
  const unclaimed = sessions.filter((s) => !claimed.has(s.name));
  if (unclaimed.length > 0 || projects.length === 0) {
    groups.push({ project: null, sessions: unclaimed });
  }

  const createSession = async (name: string, project: ProjectRecord | null) => {
    await apiPost("/api/sessions", { name });
    await refresh();
    openTab(name, project?.path);
    if (project) {
      try { await apiPost(`/api/pm/projects/${project.id}/sessions/${name}`); } catch {}
    }
  };

  const kill = async (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    if (openNames.has(name)) return;
    await apiDelete(`/api/sessions/${name}`);
    refresh();
  };

  return (
    <div className="sp">
      {groups.map((g) => (
        <Group
          key={g.project?.name ?? "__other"}
          project={g.project}
          sessions={g.sessions}
          openNames={openNames}
          openTab={openTab}
          kill={kill}
          createSession={createSession}
        />
      ))}
    </div>
  );
}

function Group({ project, sessions, openNames, openTab, kill, createSession }: {
  project: ProjectRecord | null;
  sessions: SessionInfo[];
  openNames: Set<string>;
  openTab: (name: string, path?: string) => Promise<void>;
  kill: (e: React.MouseEvent, name: string) => void;
  createSession: (name: string, project: ProjectRecord | null) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const handleAdd = () => {
    setAdding(true);
    setNewName(project ? `${project.name}-` : "");
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await createSession(name, project);
      setAdding(false);
      setNewName("");
    } catch {} finally { setBusy(false); }
  };

  return (
    <div className="sp-group">
      <div className="sp-group-header" onClick={() => setExpanded(!expanded)}>
        <span className="sp-chevron">{expanded ? "▾" : "▸"}</span>
        <span className="sp-group-name">{project ? project.name : "Other"}</span>
        <span className="sp-group-count">{sessions.length}</span>
        <button className="sp-add" onClick={(e) => { e.stopPropagation(); handleAdd(); setExpanded(true); }} title="New session">+</button>
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") setAdding(false);
                }}
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
            const shortName = project && s.name.startsWith(project.name + "-")
              ? s.name.slice(project.name.length + 1) : s.name;

            return (
              <div key={s.name} className={`sp-session ${isOpen ? "open" : ""}`} onClick={() => openTab(s.name, project?.path)}>
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
                {!isOpen && <button className="sp-kill" onClick={(e) => kill(e, s.name)}>×</button>}
              </div>
            );
          })}

          {sessions.length === 0 && !adding && <div className="sp-empty">No sessions</div>}
        </div>
      )}
    </div>
  );
}
