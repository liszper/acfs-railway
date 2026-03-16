import { useEffect, useState, useCallback } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "../api/client";
import { useTerminalStore } from "../store/terminals";
import type { ProjectRecord, ActivityRecord } from "../api/types";

type FilterMode = "all" | "active" | "archived" | "pinned";

function timeAgo(iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const STATUS_COLORS: Record<string, string> = {
  active: "var(--green)",
  archived: "var(--text-muted)",
  template: "var(--accent)",
};

const ACTIVITY_ICONS: Record<string, string> = {
  commit: "C",
  branch: "B",
  session_start: "S",
  clone: "D",
  note: "N",
  status_change: "~",
};

export function ProjectsPanel() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [available, setAvailable] = useState(true);
  const [activities, setActivities] = useState<Record<number, ActivityRecord[]>>({});
  const [activityOffsets, setActivityOffsets] = useState<Record<number, number>>({});
  const [editDesc, setEditDesc] = useState<Record<number, string>>({});
  const [tagInput, setTagInput] = useState("");
  const { openTab } = useTerminalStore();

  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter === "active" || filter === "archived") params.set("status", filter);
      if (filter === "pinned") params.set("pinned", "true");
      if (search.trim()) params.set("search", search.trim());
      const q = params.toString();
      const data = await apiGet<ProjectRecord[]>(`/api/pm/projects${q ? `?${q}` : ""}`);
      setProjects(data);
      setAvailable(true);
    } catch {
      setAvailable(false);
    }
  }, [filter, search]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, [refresh]);

  const loadActivity = async (projectId: number, loadMore = false) => {
    try {
      const offset = loadMore ? (activityOffsets[projectId] || 0) + 10 : 0;
      const data = await apiGet<ActivityRecord[]>(
        `/api/pm/projects/${projectId}/activity?limit=10&offset=${offset}`
      );
      setActivities((prev) => ({
        ...prev,
        [projectId]: loadMore ? [...(prev[projectId] || []), ...data] : data,
      }));
      setActivityOffsets((prev) => ({ ...prev, [projectId]: offset }));
    } catch {}
  };

  const toggleExpand = async (project: ProjectRecord) => {
    if (expandedId === project.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(project.id);
    // Fetch full project with stats
    try {
      const full = await apiGet<ProjectRecord>(`/api/pm/projects/${project.id}`);
      setProjects((prev) => prev.map((p) => (p.id === full.id ? full : p)));
    } catch {}
    loadActivity(project.id);
  };

  const togglePin = async (e: React.MouseEvent, project: ProjectRecord) => {
    e.stopPropagation();
    try {
      await apiPost(`/api/pm/projects/${project.id}/pin`);
      refresh();
    } catch {}
  };

  const syncProjects = async () => {
    setSyncing(true);
    try {
      await apiPost("/api/pm/sync");
      await refresh();
    } catch {}
    setSyncing(false);
  };

  const updateDescription = async (project: ProjectRecord) => {
    const desc = editDesc[project.id];
    if (desc === undefined || desc === project.description) return;
    try {
      await apiPut(`/api/pm/projects/${project.id}`, { description: desc });
      refresh();
    } catch {}
  };

  const toggleArchive = async (e: React.MouseEvent, project: ProjectRecord) => {
    e.stopPropagation();
    const newStatus = project.status === "archived" ? "active" : "archived";
    try {
      await apiPut(`/api/pm/projects/${project.id}`, { status: newStatus });
      refresh();
    } catch {}
  };

  const addTag = async (project: ProjectRecord, tag: string) => {
    if (!tag.trim() || project.tags.includes(tag.trim())) return;
    try {
      await apiPut(`/api/pm/projects/${project.id}`, {
        tags: [...project.tags, tag.trim()],
      });
      setTagInput("");
      refresh();
    } catch {}
  };

  const removeTag = async (project: ProjectRecord, tag: string) => {
    try {
      await apiPut(`/api/pm/projects/${project.id}`, {
        tags: project.tags.filter((t) => t !== tag),
      });
      refresh();
    } catch {}
  };

  const openProjectTerminal = (e: React.MouseEvent, project: ProjectRecord) => {
    e.stopPropagation();
    openTab(project.name, project.path);
  };

  const deleteProjectRecord = async (e: React.MouseEvent, project: ProjectRecord) => {
    e.stopPropagation();
    try {
      await apiDelete(`/api/pm/projects/${project.id}`);
      if (expandedId === project.id) setExpandedId(null);
      refresh();
    } catch {}
  };

  const [adding, setAdding] = useState(false);
  const [newProject, setNewProject] = useState({ name: "", path: "/data/projects/", description: "" });

  const addProject = async () => {
    if (!newProject.name.trim() || !newProject.path.trim()) return;
    try {
      await apiPost("/api/pm/projects", newProject);
      setNewProject({ name: "", path: "/data/projects/", description: "" });
      setAdding(false);
      refresh();
    } catch {}
  };

  if (!available) {
    return (
      <div className="projects-panel">
        <h3>Projects</h3>
        <div className="empty">Project management not available</div>
      </div>
    );
  }

  const sorted = [...projects].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="projects-panel">
      <div className="projects-header">
        <div className="projects-search-row">
          <input
            className="projects-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
          />
          <button
            className="projects-sync-btn"
            onClick={() => setAdding(!adding)}
            title="Add project"
          >+</button>
          <button
            className="projects-sync-btn"
            onClick={syncProjects}
            disabled={syncing}
            title="Sync from filesystem"
          >
            {syncing ? <span className="spinner-sm" /> : "\u21BB"}
          </button>
        </div>
        <div className="projects-filter-bar">
          {(["all", "active", "archived", "pinned"] as const).map((f) => (
            <button
              key={f}
              className={`projects-filter-btn ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {adding && (
        <div className="project-add-form">
          <input
            className="project-add-input"
            value={newProject.name}
            onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
            placeholder="Project name"
            autoFocus
          />
          <input
            className="project-add-input"
            value={newProject.path}
            onChange={(e) => setNewProject({ ...newProject, path: e.target.value })}
            placeholder="/data/projects/my-app"
          />
          <input
            className="project-add-input"
            value={newProject.description}
            onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
            placeholder="Description (optional)"
            onKeyDown={(e) => e.key === "Enter" && addProject()}
          />
          <div className="project-add-actions">
            <button className="project-add-btn" onClick={addProject} disabled={!newProject.name.trim() || !newProject.path.trim()}>Add</button>
            <button className="project-add-cancel" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="project-list">
        {sorted.map((p) => {
          const expanded = expandedId === p.id;
          const projectActivities = activities[p.id] || [];
          return (
            <div
              key={p.id}
              className={`project-card ${p.pinned ? "pinned" : ""} ${expanded ? "expanded" : ""}`}
              onClick={() => toggleExpand(p)}
            >
              <div className="project-card-header">
                <button
                  className={`project-pin ${p.pinned ? "active" : ""}`}
                  onClick={(e) => togglePin(e, p)}
                  title={p.pinned ? "Unpin" : "Pin"}
                >
                  {p.pinned ? "\u2605" : "\u2606"}
                </button>
                <div className="project-card-info">
                  <span className="project-name">{p.name}</span>
                  {p.description && (
                    <span className="project-desc">{p.description}</span>
                  )}
                </div>
              </div>

              <div className="project-meta">
                <span
                  className="project-status-badge"
                  style={{ color: STATUS_COLORS[p.status] }}
                >
                  {p.status}
                </span>
                {p.defaultBranch && (
                  <span className="project-branch">{p.defaultBranch}</span>
                )}
                {p.remoteUrl && (
                  <span className="project-remote" title={p.remoteUrl}>
                    R
                  </span>
                )}
                {p.tags.map((t) => (
                  <span key={t} className="tag-pill">
                    {t}
                  </span>
                ))}
              </div>

              {p.stats && (
                <div className="project-stats">
                  <span>{p.stats.commits} commits</span>
                  <span>{p.stats.sessions} sessions</span>
                  {p.stats.lastActivity && (
                    <span>{timeAgo(p.stats.lastActivity)}</span>
                  )}
                </div>
              )}

              <div className="project-actions">
                <button
                  className="project-action-btn"
                  onClick={(e) => openProjectTerminal(e, p)}
                  title="Open terminal"
                >
                  &gt;_
                </button>
                <button
                  className="project-action-btn"
                  onClick={(e) => toggleArchive(e, p)}
                  title={p.status === "archived" ? "Unarchive" : "Archive"}
                >
                  {p.status === "archived" ? "\u21A9" : "\u2193"}
                </button>
                <button
                  className="project-action-btn project-action-delete"
                  onClick={(e) => deleteProjectRecord(e, p)}
                  title="Remove from database (doesn't delete files)"
                >
                  &times;
                </button>
              </div>

              {expanded && (
                <div className="project-detail" onClick={(e) => e.stopPropagation()}>
                  <div className="project-detail-section">
                    <label className="project-detail-label">Description</label>
                    <textarea
                      className="project-detail-textarea"
                      value={editDesc[p.id] ?? p.description}
                      onChange={(e) =>
                        setEditDesc((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                      onBlur={() => updateDescription(p)}
                      rows={2}
                    />
                  </div>

                  <div className="project-detail-section">
                    <label className="project-detail-label">Tags</label>
                    <div className="tag-editor">
                      {p.tags.map((t) => (
                        <span key={t} className="tag-pill removable" onClick={() => removeTag(p, t)}>
                          {t} &times;
                        </span>
                      ))}
                      <input
                        className="tag-input"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            addTag(p, tagInput);
                          }
                        }}
                        placeholder="Add tag..."
                      />
                    </div>
                  </div>

                  <div className="project-detail-section">
                    <label className="project-detail-label">Path</label>
                    <div className="project-path">{p.path}</div>
                  </div>

                  <div className="project-detail-section">
                    <label className="project-detail-label">Activity</label>
                    <div className="activity-feed">
                      {projectActivities.length === 0 && (
                        <div className="empty">No activity yet</div>
                      )}
                      {projectActivities.map((a) => (
                        <div key={a.id} className="activity-item">
                          <span className="activity-type" title={a.type}>
                            {ACTIVITY_ICONS[a.type] || "?"}
                          </span>
                          <span className="activity-summary">{a.summary}</span>
                          <span className="activity-time">{timeAgo(a.createdAt)}</span>
                        </div>
                      ))}
                      {projectActivities.length > 0 &&
                        projectActivities.length % 10 === 0 && (
                          <button
                            className="project-action-btn load-more"
                            onClick={() => loadActivity(p.id, true)}
                          >
                            Load more
                          </button>
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
