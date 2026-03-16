import { useEffect, useState, useCallback } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "../api/client";
import { useTerminalStore } from "../store/terminals";
import { GitPanel } from "./GitPanel";
import type { ProjectRecord, ActivityRecord } from "../api/types";

type FilterMode = "all" | "active" | "archived" | "pinned";

function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const STATUS_COLORS: Record<string, string> = {
  active: "var(--green)", archived: "var(--text-muted)", template: "var(--accent)",
};
const ACTIVITY_ICONS: Record<string, string> = {
  commit: "C", branch: "B", session_start: "S", clone: "D", note: "N", status_change: "~",
};

// ── Confirm Dialog ──────────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }: {
  message: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="confirm-btn confirm-btn-danger" onClick={onConfirm}>Delete</button>
          <button className="confirm-btn confirm-btn-cancel" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Panel ──────────────────────────────────────────────────────────────
export function ProjectsPanel() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [available, setAvailable] = useState(true);
  const [activities, setActivities] = useState<Record<number, ActivityRecord[]>>({});
  const [gitProject, setGitProject] = useState<string | null>(null);
  const [activityOffsets, setActivityOffsets] = useState<Record<number, number>>({});
  const [editDesc, setEditDesc] = useState<Record<number, string>>({});
  const [tagInput, setTagInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<ProjectRecord | null>(null);
  const { openTab } = useTerminalStore();

  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter === "active" || filter === "archived") params.set("status", filter);
      if (filter === "pinned") params.set("pinned", "true");
      if (search.trim()) params.set("search", search.trim());
      const q = params.toString();
      setProjects(await apiGet<ProjectRecord[]>(`/api/pm/projects${q ? `?${q}` : ""}`));
      setAvailable(true);
    } catch { setAvailable(false); }
  }, [filter, search]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
  }, [refresh]);

  // ── Actions ──

  const loadActivity = async (pid: number, more = false) => {
    try {
      const offset = more ? (activityOffsets[pid] || 0) + 10 : 0;
      const data = await apiGet<ActivityRecord[]>(`/api/pm/projects/${pid}/activity?limit=10&offset=${offset}`);
      setActivities((p) => ({ ...p, [pid]: more ? [...(p[pid] || []), ...data] : data }));
      setActivityOffsets((p) => ({ ...p, [pid]: offset }));
    } catch {}
  };

  const toggleExpand = async (p: ProjectRecord) => {
    if (expandedId === p.id) { setExpandedId(null); return; }
    setExpandedId(p.id);
    try {
      const full = await apiGet<ProjectRecord>(`/api/pm/projects/${p.id}`);
      setProjects((prev) => prev.map((x) => (x.id === full.id ? full : x)));
    } catch {}
    loadActivity(p.id);
  };

  const togglePin = async (e: React.MouseEvent, p: ProjectRecord) => {
    e.stopPropagation();
    try { await apiPost(`/api/pm/projects/${p.id}/pin`); refresh(); } catch {}
  };

  const syncProjects = async () => {
    setSyncing(true);
    try { await apiPost("/api/pm/sync"); await refresh(); } catch {}
    setSyncing(false);
  };

  const saveDesc = async (p: ProjectRecord) => {
    const desc = editDesc[p.id];
    if (desc === undefined || desc === p.description) return;
    try { await apiPut(`/api/pm/projects/${p.id}`, { description: desc }); refresh(); } catch {}
  };

  const toggleArchive = async (e: React.MouseEvent, p: ProjectRecord) => {
    e.stopPropagation();
    try { await apiPut(`/api/pm/projects/${p.id}`, { status: p.status === "archived" ? "active" : "archived" }); refresh(); } catch {}
  };

  const addTag = async (p: ProjectRecord, tag: string) => {
    if (!tag.trim() || p.tags.includes(tag.trim())) return;
    try { await apiPut(`/api/pm/projects/${p.id}`, { tags: [...p.tags, tag.trim()] }); setTagInput(""); refresh(); } catch {}
  };

  const removeTag = async (p: ProjectRecord, tag: string) => {
    try { await apiPut(`/api/pm/projects/${p.id}`, { tags: p.tags.filter((t) => t !== tag) }); refresh(); } catch {}
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await apiDelete(`/api/pm/projects/${confirmDelete.id}`);
      if (expandedId === confirmDelete.id) setExpandedId(null);
      refresh();
    } catch {}
    setConfirmDelete(null);
  };

  const cloneProject = async () => {
    const url = cloneUrl.trim();
    if (!url) return;
    setCloning(true); setCloneError("");
    try {
      const r = await apiPost<{ ok: boolean; name: string; error?: string }>("/api/projects/clone", { url });
      if (r.ok) {
        await apiPost("/api/pm/sync");
        setCloneUrl(""); setAdding(false); refresh();
      } else { setCloneError(r.error || "Clone failed"); }
    } catch (e) { setCloneError(String(e)); }
    finally { setCloning(false); }
  };

  // ── Render ──

  // Show GitPanel sub-view when a project's git is opened
  if (gitProject) {
    return <GitPanel projectName={gitProject} onBack={() => setGitProject(null)} />;
  }

  if (!available) {
    return <div className="projects-panel"><h3>Projects</h3><div className="empty">Project management not available</div></div>;
  }

  const sorted = [...projects].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="projects-panel">
      {confirmDelete && (
        <ConfirmDialog
          message={`Delete "${confirmDelete.name}" from project database? Files on disk won't be affected.`}
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Header */}
      <div className="projects-header">
        <div className="projects-search-row">
          <input className="projects-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." />
          <button className="projects-sync-btn" onClick={() => { setAdding(!adding); setCloneError(""); }} title="Clone repo">+</button>
          <button className="projects-sync-btn" onClick={syncProjects} disabled={syncing} title="Sync filesystem">
            {syncing ? <span className="spinner-sm" /> : "\u21BB"}
          </button>
        </div>
        <div className="projects-filter-bar">
          {(["all", "active", "archived", "pinned"] as const).map((f) => (
            <button key={f} className={`projects-filter-btn ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Clone form */}
      {adding && (
        <div className="project-add-form">
          <input
            className="project-add-input"
            value={cloneUrl}
            onChange={(e) => { setCloneUrl(e.target.value); setCloneError(""); }}
            placeholder="owner/repo or https://github.com/..."
            onKeyDown={(e) => { if (e.key === "Enter") cloneProject(); if (e.key === "Escape") setAdding(false); }}
            autoFocus
          />
          {cloneError && <div className="project-add-error">{cloneError}</div>}
          <div className="project-add-actions">
            <button className="project-add-btn" onClick={cloneProject} disabled={!cloneUrl.trim() || cloning}>
              {cloning ? "Cloning..." : "Clone"}
            </button>
            <button className="project-add-cancel" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Project list */}
      <div className="project-list">
        {sorted.map((p) => {
          const isExpanded = expandedId === p.id;
          const acts = activities[p.id] || [];
          return (
            <div key={p.id} className={`project-card ${p.pinned ? "pinned" : ""} ${isExpanded ? "expanded" : ""}`} onClick={() => toggleExpand(p)}>
              <div className="project-card-header">
                <button className={`project-pin ${p.pinned ? "active" : ""}`} onClick={(e) => togglePin(e, p)} title={p.pinned ? "Unpin" : "Pin"}>
                  {p.pinned ? "\u2605" : "\u2606"}
                </button>
                <div className="project-card-info">
                  <span className="project-name">{p.name}</span>
                  {p.description && <span className="project-desc">{p.description}</span>}
                </div>
              </div>

              <div className="project-meta">
                <span className="project-status-badge" style={{ color: STATUS_COLORS[p.status] }}>{p.status}</span>
                {p.defaultBranch && <span className="project-branch">{p.defaultBranch}</span>}
                {p.remoteUrl && <span className="project-remote" title={p.remoteUrl}>R</span>}
                {p.tags.map((t) => <span key={t} className="tag-pill">{t}</span>)}
              </div>

              {p.stats && (
                <div className="project-stats">
                  <span>{p.stats.commits} commits</span>
                  <span>{p.stats.sessions} sessions</span>
                  {p.stats.lastActivity && <span>{timeAgo(p.stats.lastActivity)}</span>}
                </div>
              )}

              <div className="project-actions">
                <button className="project-action-btn" onClick={(e) => { e.stopPropagation(); openTab(p.name, p.path); }} title="Open terminal">&gt;_</button>
                <button className="project-action-btn" onClick={(e) => { e.stopPropagation(); setGitProject(p.name); }} title="Git operations">G</button>
                <button className="project-action-btn" onClick={(e) => toggleArchive(e, p)} title={p.status === "archived" ? "Unarchive" : "Archive"}>
                  {p.status === "archived" ? "\u21A9" : "\u2193"}
                </button>
                <button className="project-action-btn project-action-delete" onClick={(e) => { e.stopPropagation(); setConfirmDelete(p); }} title="Delete">
                  &times;
                </button>
              </div>

              {isExpanded && (
                <div className="project-detail" onClick={(e) => e.stopPropagation()}>
                  <div className="project-detail-section">
                    <label className="project-detail-label">Description</label>
                    <textarea
                      className="project-detail-textarea"
                      value={editDesc[p.id] ?? p.description}
                      onChange={(e) => setEditDesc((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      onBlur={() => saveDesc(p)}
                      rows={2}
                    />
                  </div>

                  <div className="project-detail-section">
                    <label className="project-detail-label">Tags</label>
                    <div className="tag-editor">
                      {p.tags.map((t) => (
                        <span key={t} className="tag-pill removable" onClick={() => removeTag(p, t)}>{t} &times;</span>
                      ))}
                      <input
                        className="tag-input"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") addTag(p, tagInput); }}
                        placeholder="Add tag..."
                      />
                    </div>
                  </div>

                  <div className="project-detail-section">
                    <label className="project-detail-label">Path</label>
                    <div className="project-path">{p.path}</div>
                  </div>

                  {p.remoteUrl && (
                    <div className="project-detail-section">
                      <label className="project-detail-label">Remote</label>
                      <div className="project-path">{p.remoteUrl}</div>
                    </div>
                  )}

                  <div className="project-detail-section">
                    <label className="project-detail-label">Activity</label>
                    <div className="activity-feed">
                      {acts.length === 0 && <div className="empty">No activity yet</div>}
                      {acts.map((a) => (
                        <div key={a.id} className="activity-item">
                          <span className="activity-type" title={a.type}>{ACTIVITY_ICONS[a.type] || "?"}</span>
                          <span className="activity-summary">{a.summary}</span>
                          <span className="activity-time">{timeAgo(a.createdAt)}</span>
                        </div>
                      ))}
                      {acts.length > 0 && acts.length % 10 === 0 && (
                        <button className="project-action-btn load-more" onClick={() => loadActivity(p.id, true)}>Load more</button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {sorted.length === 0 && <div className="empty">No projects found</div>}
      </div>
    </div>
  );
}
