import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "../api/client";
import { useTerminalStore } from "../store/terminals";
import type { SessionInfo, ProjectRecord } from "../api/types";

const AC: Record<string, string> = { claude: "#bc8cff", codex: "#3fb950", gemini: "#58a6ff" };

interface ProjectGroup {
  project: ProjectRecord | null; // null = unassociated sessions
  sessions: SessionInfo[];
}

export function SessionsPanel() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [spawning, setSpawning] = useState<string | null>(null); // project name being spawned for
  const [spawnName, setSpawnName] = useState("");
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

  // Group sessions by project — match session name prefix to project name
  const groups: ProjectGroup[] = [];
  const claimed = new Set<string>();

  for (const p of projects) {
    const matching = sessions.filter(
      (s) => s.name === p.name || s.name.startsWith(p.name + "-")
    );
    matching.forEach((s) => claimed.add(s.name));
    groups.push({ project: p, sessions: matching });
  }
  const unclaimed = sessions.filter((s) => !claimed.has(s.name));
  if (unclaimed.length > 0) {
    groups.push({ project: null, sessions: unclaimed });
  }

  const spawn = async (project: ProjectRecord | null) => {
    const name = spawnName.trim();
    if (!name) return;
    setSpawning(project?.name ?? "__global");
    try {
      await apiPost("/api/sessions", { name });
      setSpawnName("");
      await refresh();
      openTab(name, project?.path);
      if (project) {
        try { await apiPost(`/api/pm/projects/${project.id}/sessions/${name}`); } catch {}
      }
    } catch {} finally { setSpawning(null); }
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
        <ProjectGroupView
          key={g.project?.name ?? "__other"}
          group={g}
          openNames={openNames}
          openTab={openTab}
          kill={kill}
          spawning={spawning}
          spawnName={spawnName}
          setSpawnName={setSpawnName}
          spawn={spawn}
        />
      ))}
      {groups.length === 0 && <div className="empty">No projects or sessions</div>}
    </div>
  );
}

function ProjectGroupView({
  group, openNames, openTab, kill, spawning, spawnName, setSpawnName, spawn,
}: {
  group: ProjectGroup;
  openNames: Set<string>;
  openTab: (name: string, path?: string) => Promise<void>;
  kill: (e: React.MouseEvent, name: string) => void;
  spawning: string | null;
  spawnName: string;
  setSpawnName: (v: string) => void;
  spawn: (p: ProjectRecord | null) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const p = group.project;
  const groupKey = p?.name ?? "__other";
  const isSpawningHere = spawning === groupKey;

  return (
    <div className="sp-group">
      <div className="sp-group-header" onClick={() => setExpanded(!expanded)}>
        <span className="sp-chevron">{expanded ? "▾" : "▸"}</span>
        <span className="sp-group-name">{p ? p.name : "Other"}</span>
        <span className="sp-group-count">{group.sessions.length}</span>
        <button
          className="sp-add"
          onClick={(e) => {
            e.stopPropagation();
            setSpawnName(p ? `${p.name}-` : "");
            setExpanded(true);
          }}
          title="New session"
        >+</button>
      </div>

      {expanded && (
        <div className="sp-group-body">
          {/* Inline spawn row */}
          {(isSpawningHere || spawnName.startsWith((p?.name ?? "") + "-") || (!p && spawnName && !spawnName.includes("-"))) && (
            <div className="sp-spawn-row">
              <input
                className="sp-spawn-input"
                value={spawnName}
                onChange={(e) => setSpawnName(e.target.value)}
                placeholder={p ? `${p.name}-task` : "session-name"}
                onKeyDown={(e) => e.key === "Enter" && spawn(p)}
                autoFocus
              />
              <button
                className="sp-spawn-go"
                onClick={() => spawn(p)}
                disabled={!spawnName.trim() || !!spawning}
              >
                {isSpawningHere ? "..." : "Go"}
              </button>
            </div>
          )}

          {group.sessions.map((s) => {
            const isOpen = openNames.has(s.name);
            const agents = s.agentCounts;
            const hasAgents = agents.claude + agents.codex + agents.gemini > 0;
            // Show short name (strip project prefix)
            const shortName = p && s.name.startsWith(p.name + "-")
              ? s.name.slice(p.name.length + 1)
              : s.name;

            return (
              <div
                key={s.name}
                className={`sp-session ${isOpen ? "open" : ""}`}
                onClick={() => openTab(s.name, p?.path)}
              >
                {isOpen && <span className="sp-dot" />}
                <span className="sp-sname">{shortName}</span>
                <span className="sp-indicators">
                  <span className="sp-proc">{s.processLabel}</span>
                  {s.paneCount > 1 && <span className="sp-badge">{s.paneCount}p</span>}
                  {hasAgents && (
                    <>
                      {agents.claude > 0 && <span style={{ color: AC.claude }} className="sp-agent">C{agents.claude > 1 ? agents.claude : ""}</span>}
                      {agents.codex > 0 && <span style={{ color: AC.codex }} className="sp-agent">X{agents.codex > 1 ? agents.codex : ""}</span>}
                      {agents.gemini > 0 && <span style={{ color: AC.gemini }} className="sp-agent">G{agents.gemini > 1 ? agents.gemini : ""}</span>}
                    </>
                  )}
                  {s.isNtmSession && <span className="sp-badge sp-ntm">ntm</span>}
                </span>
                {!isOpen && (
                  <button className="sp-kill" onClick={(e) => kill(e, s.name)}>×</button>
                )}
              </div>
            );
          })}

          {group.sessions.length === 0 && (
            <div className="sp-empty">No sessions</div>
          )}
        </div>
      )}
    </div>
  );
}
