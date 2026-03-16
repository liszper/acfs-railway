import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "../api/client";
import { useTerminalStore } from "../store/terminals";
import type { SessionInfo, ProjectRecord } from "../api/types";

const AC: Record<string, string> = { claude: "#bc8cff", codex: "#3fb950", gemini: "#58a6ff" };

type Tool = "shell" | "claude" | "codex" | "gemini" | "opencode" | "lazygit" | "ntm";

interface ToolDef {
  id: Tool;
  label: string;
  color: string;
  badge: string;
  /** The actual command sent to the tmux session */
  command: string | null;
  desc: string;
}

const TOOLS: ToolDef[] = [
  { id: "shell",    label: "Shell",    color: "var(--text-muted)", badge: ">_", command: null,     desc: "Plain terminal" },
  { id: "claude",   label: "Claude",   color: "#bc8cff",          badge: "C",  command: "cc",     desc: "Claude Code agent" },
  { id: "codex",    label: "Codex",    color: "#3fb950",          badge: "X",  command: "cod",    desc: "Codex CLI agent" },
  { id: "gemini",   label: "Gemini",   color: "#58a6ff",          badge: "G",  command: "gmi",    desc: "Gemini CLI agent" },
  { id: "opencode", label: "OpenCode", color: "var(--yellow)",    badge: "O",  command: "opencode", desc: "OpenCode agent" },
  { id: "lazygit",  label: "Lazygit",  color: "#e06c75",          badge: "LG", command: "lazygit",  desc: "Git TUI" },
];

function timeAgo(ts: number): string {
  const s = (Date.now() / 1000) - ts;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function Confirm({ message, action, onConfirm, onCancel }: {
  message: string; action: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="confirm-btn confirm-btn-danger" onClick={onConfirm}>{action}</button>
          <button className="confirm-btn confirm-btn-cancel" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function AgentBadges({ counts }: { counts: SessionInfo["agentCounts"] }) {
  const { claude, codex, gemini } = counts;
  if (claude + codex + gemini === 0) return null;
  return (
    <span className="s-agents">
      {claude > 0 && <span style={{ background: AC.claude }}>C{claude > 1 ? claude : ""}</span>}
      {codex > 0 && <span style={{ background: AC.codex }}>X{codex > 1 ? codex : ""}</span>}
      {gemini > 0 && <span style={{ background: AC.gemini }}>G{gemini > 1 ? gemini : ""}</span>}
    </span>
  );
}

function SessionRow({ s, project, isOpen, onOpen, onSelect, onKill }: {
  s: SessionInfo;
  project: ProjectRecord | null;
  isOpen: boolean;
  onOpen: () => void;
  onSelect: () => void;
  onKill: () => void;
}) {
  const short = project && s.name.toLowerCase().startsWith(project.name.toLowerCase() + "-")
    ? s.name.slice(project.name.length + 1) : s.name;

  return (
    <div className={`s-row ${isOpen ? "s-open" : ""}`}>
      <div className="s-row-main" onClick={onOpen}>
        <span className={`s-status-dot ${isOpen ? "s-dot-open" : s.attached > 0 ? "s-dot-attached" : ""}`} />
        <span className="s-name">{short}</span>
        <AgentBadges counts={s.agentCounts} />
        {s.isNtmSession && <span className="s-tag s-tag-ntm">NTM</span>}
        {s.paneCount > 1 && <span className="s-tag">{s.paneCount}P</span>}
        {s.windows > 1 && <span className="s-tag">{s.windows}W</span>}
        <span className="s-meta">{s.processLabel}</span>
        <span className="s-time">{timeAgo(s.created)}</span>
      </div>
      <div className="s-row-actions">
        <button className="s-btn s-btn-info" onClick={onSelect} title="Details">...</button>
        <button className="s-btn s-btn-kill" onClick={onKill} title="Terminate">×</button>
      </div>
    </div>
  );
}

export function SessionsPanel() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [confirmKill, setConfirmKill] = useState<SessionInfo | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<string | null>(null);
  const { openTab, tabs, closeTab } = useTerminalStore();
  const openNames = new Set(tabs.map((t) => t.sessionName));

  const refresh = async () => { try { setSessions(await apiGet<SessionInfo[]>("/api/sessions")); } catch {} };
  const refreshProjects = async () => { try { setProjects(await apiGet<ProjectRecord[]>("/api/pm/projects?status=active")); } catch {} };

  useEffect(() => {
    refresh(); refreshProjects();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  // Group
  const claimed = new Set<string>();
  const groups: { project: ProjectRecord | null; sessions: SessionInfo[] }[] = [];
  for (const p of projects) {
    const pl = p.name.toLowerCase();
    const m = sessions.filter((s) => { const sl = s.name.toLowerCase(); return sl === pl || sl.startsWith(pl + "-"); });
    m.forEach((s) => claimed.add(s.name));
    groups.push({ project: p, sessions: m });
  }
  const unclaimed = sessions.filter((s) => !claimed.has(s.name));
  if (unclaimed.length > 0 || projects.length === 0) groups.push({ project: null, sessions: unclaimed });

  const doCreateSession = async (name: string, tool: ToolDef, project: ProjectRecord | null) => {
    await apiPost("/api/sessions", { name, cwd: project?.path });
    // Pass command to openTab — it sends keystrokes after the terminal is attached and ready
    openTab(name, project?.path, tool.command || undefined);
    if (project) try { await apiPost(`/api/pm/projects/${project.id}/sessions/${name}`); } catch {}
    await refresh();
    setTimeout(refresh, 1000);
  };

  const doKill = async () => {
    if (!confirmKill) return;
    const tab = tabs.find((t) => t.sessionName === confirmKill.name);
    if (tab) closeTab(tab.id);
    await apiDelete(`/api/sessions/${confirmKill.name}`);
    setConfirmKill(null);
    if (expandedDetail === confirmKill.name) setExpandedDetail(null);
    refresh();
  };

  // Detail inline
  const detailSession = expandedDetail ? sessions.find((s) => s.name === expandedDetail) : null;
  const detailProject = expandedDetail
    ? projects.find((p) => expandedDetail.toLowerCase() === p.name.toLowerCase() || expandedDetail.toLowerCase().startsWith(p.name.toLowerCase() + "-")) ?? null
    : null;

  return (
    <div className="s-panel">
      {confirmKill && (
        <Confirm
          message={`Terminate "${confirmKill.name}"? All processes in this session will be killed.`}
          action="Terminate"
          onConfirm={doKill}
          onCancel={() => setConfirmKill(null)}
        />
      )}

      {/* Summary bar */}
      <div className="s-summary">
        <span className="s-summary-count">{sessions.length}</span>
        <span className="s-summary-label">sessions</span>
        <span className="s-summary-sep" />
        <span className="s-summary-count">{sessions.reduce((a, s) => a + s.agentCounts.claude + s.agentCounts.codex + s.agentCounts.gemini, 0)}</span>
        <span className="s-summary-label">agents</span>
      </div>

      {/* Inline detail */}
      {detailSession && (
        <div className="s-detail-card">
          <div className="s-detail-top">
            <span className="s-detail-title">{detailSession.name}</span>
            <button className="s-detail-x" onClick={() => setExpandedDetail(null)}>×</button>
          </div>
          <div className="s-detail-info">
            <div><span className="s-dl">Process</span><span>{detailSession.processLabel}</span></div>
            <div><span className="s-dl">Panes</span><span>{detailSession.paneCount}</span></div>
            <div><span className="s-dl">Windows</span><span>{detailSession.windows}</span></div>
            <div><span className="s-dl">Attached</span><span>{detailSession.attached > 0 ? "Yes" : "No"}</span></div>
            <div><span className="s-dl">Created</span><span>{new Date(detailSession.created * 1000).toLocaleString()}</span></div>
            {(detailSession.agentCounts.claude + detailSession.agentCounts.codex + detailSession.agentCounts.gemini > 0) && (
              <div><span className="s-dl">Agents</span><span><AgentBadges counts={detailSession.agentCounts} /></span></div>
            )}
          </div>
          <div className="s-detail-btns">
            {!openNames.has(detailSession.name) ? (
              <button className="s-dbtn s-dbtn-open" onClick={() => { openTab(detailSession.name, detailProject?.path); setExpandedDetail(null); }}>Open</button>
            ) : (
              <button className="s-dbtn s-dbtn-focus" onClick={() => { const t = tabs.find((t) => t.sessionName === detailSession.name); if (t) useTerminalStore.getState().setActive(t.id); setExpandedDetail(null); }}>Focus</button>
            )}
            <button className="s-dbtn s-dbtn-kill" onClick={() => setConfirmKill(detailSession)}>Terminate</button>
          </div>
        </div>
      )}

      {/* Groups */}
      {groups.map((g) => (
        <ProjectGroup
          key={g.project?.name ?? "__other"}
          project={g.project}
          sessions={g.sessions}
          openNames={openNames}
          onOpen={(name) => openTab(name, g.project?.path)}
          onCreate={(name, tool) => doCreateSession(name, tool, g.project)}
          onSelect={setExpandedDetail}
          onKill={setConfirmKill}
        />
      ))}
    </div>
  );
}

function ProjectGroup({ project, sessions, openNames, onOpen, onCreate, onSelect, onKill }: {
  project: ProjectRecord | null;
  sessions: SessionInfo[];
  openNames: Set<string>;
  onOpen: (name: string) => void;
  onCreate: (name: string, tool: ToolDef) => void;
  onSelect: (name: string) => void;
  onKill: (s: SessionInfo) => void;
}) {
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [tool, setTool] = useState<Tool>("shell");
  const [busy, setBusy] = useState(false);

  const selectedTool = TOOLS.find((t) => t.id === tool)!;

  const doCreate = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    try { await onCreate(n, selectedTool); setAdding(false); setName(""); setTool("shell"); } catch {} finally { setBusy(false); }
  };

  return (
    <div className="s-grp">
      <div className="s-grp-hdr" onClick={() => setOpen(!open)}>
        <span className="s-chev">{open ? "▾" : "▸"}</span>
        <span className="s-grp-icon">{project ? "◆" : "○"}</span>
        <span className="s-grp-name">{project?.name ?? "Ungrouped"}</span>
        {sessions.length > 0 && <span className="s-grp-cnt">{sessions.length}</span>}
        <button className="s-grp-add" onClick={(e) => { e.stopPropagation(); setAdding(true); setName(project ? `${project.name}-` : ""); setTool("shell"); setOpen(true); }}>+</button>
      </div>
      {open && (
        <div className="s-grp-body">
          {adding && (
            <div className="s-new-form">
              <div className="s-new">
                <input
                  value={name} onChange={(e) => setName(e.target.value)}
                  placeholder={project ? `${project.name}-task` : "session-name"}
                  onKeyDown={(e) => { if (e.key === "Enter") doCreate(); if (e.key === "Escape") { setAdding(false); } }}
                  autoFocus
                />
                <button onClick={doCreate} disabled={!name.trim() || busy}>{busy ? "..." : "Go"}</button>
                <button className="s-new-x" onClick={() => setAdding(false)}>×</button>
              </div>
              <div className="s-tool-picker">
                {TOOLS.map((t) => (
                  <button
                    key={t.id}
                    className={`s-tool-btn ${tool === t.id ? "s-tool-active" : ""}`}
                    style={{ "--tool-color": t.color } as React.CSSProperties}
                    onClick={() => setTool(t.id)}
                    title={t.desc}
                  >
                    {t.badge}
                  </button>
                ))}
              </div>
              {tool !== "shell" && (
                <div className="s-tool-hint">{selectedTool.desc}</div>
              )}
            </div>
          )}
          {sessions.map((s) => (
            <SessionRow
              key={s.name} s={s} project={project}
              isOpen={openNames.has(s.name)}
              onOpen={() => onOpen(s.name)}
              onSelect={() => onSelect(s.name)}
              onKill={() => onKill(s)}
            />
          ))}
          {sessions.length === 0 && !adding && <div className="s-empty">No sessions</div>}
        </div>
      )}
    </div>
  );
}
