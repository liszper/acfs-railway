import { db } from "./db.js";
import { existsSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

export interface ProjectRecord {
  id: number;
  name: string;
  path: string;
  description: string;
  status: "active" | "archived" | "template";
  tags: string[];
  remoteUrl: string | null;
  defaultBranch: string | null;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
  pinned: boolean;
}

export interface ProjectUpdate {
  description: string;
  status: string;
  tags: string[];
  pinned: boolean;
}

export interface ActivityRecord {
  id: number;
  projectId: number | null;
  sessionName: string | null;
  type: string;
  summary: string;
  detail: string;
  createdAt: string;
}

interface RawProjectRow {
  id: number;
  name: string;
  path: string;
  description: string;
  status: "active" | "archived" | "template";
  tags: string;
  remote_url: string | null;
  default_branch: string | null;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
  pinned: number;
}

interface RawActivityRow {
  id: number;
  project_id: number | null;
  session_name: string | null;
  type: string;
  summary: string;
  detail: string;
  created_at: string;
}

function rowToProject(row: RawProjectRow): ProjectRecord {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags);
  } catch {}
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    description: row.description,
    status: row.status,
    tags,
    remoteUrl: row.remote_url,
    defaultBranch: row.default_branch,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
    pinned: row.pinned === 1,
  };
}

function rowToActivity(row: RawActivityRow): ActivityRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    sessionName: row.session_name,
    type: row.type,
    summary: row.summary,
    detail: row.detail,
    createdAt: row.created_at,
  };
}

function gitRemoteUrl(dirPath: string): string | null {
  try {
    return execSync("git config --get remote.origin.url", {
      cwd: dirPath,
      encoding: "utf-8",
      timeout: 5000,
    }).trim() || null;
  } catch {
    return null;
  }
}

function gitDefaultBranch(dirPath: string): string | null {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: dirPath,
      encoding: "utf-8",
      timeout: 5000,
    }).trim() || null;
  } catch {
    return null;
  }
}

// --- Prepared statements ---

const stmtInsertProject = db.prepare(
  `INSERT OR IGNORE INTO projects (name, path, remote_url, default_branch)
   VALUES (?, ?, ?, ?)`
);

const stmtInsertProjectFull = db.prepare(
  `INSERT INTO projects (name, path, description, remote_url, default_branch)
   VALUES (?, ?, ?, ?, ?)`
);

const stmtAllProjects = db.prepare("SELECT * FROM projects ORDER BY pinned DESC, name ASC");

const stmtProjectsByStatus = db.prepare(
  "SELECT * FROM projects WHERE status = ? ORDER BY pinned DESC, name ASC"
);

const stmtProjectsBySearch = db.prepare(
  "SELECT * FROM projects WHERE (name LIKE ? OR description LIKE ?) ORDER BY pinned DESC, name ASC"
);

const stmtProjectsByStatusSearch = db.prepare(
  "SELECT * FROM projects WHERE status = ? AND (name LIKE ? OR description LIKE ?) ORDER BY pinned DESC, name ASC"
);

const stmtPinnedProjects = db.prepare(
  "SELECT * FROM projects WHERE pinned = 1 ORDER BY name ASC"
);

const stmtPinnedByStatus = db.prepare(
  "SELECT * FROM projects WHERE pinned = 1 AND status = ? ORDER BY name ASC"
);

const stmtProjectById = db.prepare("SELECT * FROM projects WHERE id = ?");

const stmtProjectByName = db.prepare("SELECT * FROM projects WHERE name = ?");

const stmtDeleteProject = db.prepare("DELETE FROM projects WHERE id = ?");

const stmtTogglePin = db.prepare(
  "UPDATE projects SET pinned = CASE WHEN pinned = 1 THEN 0 ELSE 1 END, updated_at = datetime('now') WHERE id = ?"
);

const stmtArchiveProject = db.prepare(
  "UPDATE projects SET status = 'archived', updated_at = datetime('now') WHERE id = ? AND status = 'active'"
);

const stmtAttachSession = db.prepare(
  "INSERT OR IGNORE INTO session_projects (session_name, project_id) VALUES (?, ?)"
);

const stmtDetachSession = db.prepare(
  "DELETE FROM session_projects WHERE session_name = ? AND project_id = ?"
);

const stmtSessionProjects = db.prepare(
  `SELECT p.* FROM projects p
   JOIN session_projects sp ON sp.project_id = p.id
   WHERE sp.session_name = ?
   ORDER BY sp.attached_at DESC`
);

const stmtProjectSessions = db.prepare(
  "SELECT session_name FROM session_projects WHERE project_id = ? ORDER BY attached_at DESC"
);

const stmtInsertActivity = db.prepare(
  "INSERT INTO activity (project_id, session_name, type, summary, detail) VALUES (?, ?, ?, ?, ?)"
);

const stmtActivityAll = db.prepare(
  "SELECT * FROM activity ORDER BY created_at DESC LIMIT ? OFFSET ?"
);

const stmtActivityByProject = db.prepare(
  "SELECT * FROM activity WHERE project_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
);

const stmtCommitCount = db.prepare(
  "SELECT COUNT(*) as cnt FROM activity WHERE project_id = ? AND type = 'commit'"
);

const stmtSessionCount = db.prepare(
  "SELECT COUNT(DISTINCT session_name) as cnt FROM session_projects WHERE project_id = ?"
);

const stmtLastActivity = db.prepare(
  "SELECT created_at FROM activity WHERE project_id = ? ORDER BY created_at DESC LIMIT 1"
);

const stmtAllActiveNames = db.prepare(
  "SELECT id, name, path FROM projects WHERE status = 'active'"
);

// --- Public functions ---

export function syncProjects(): void {
  const projectsDir = "/data/projects";
  if (!existsSync(projectsDir)) return;

  const entries = readdirSync(projectsDir);
  for (const entry of entries) {
    const fullPath = join(projectsDir, entry);
    try {
      if (!statSync(fullPath).isDirectory()) continue;
    } catch {
      continue;
    }
    const remote = gitRemoteUrl(fullPath);
    const branch = gitDefaultBranch(fullPath);
    stmtInsertProject.run(entry, fullPath, remote, branch);
  }

  // Mark projects whose directories no longer exist as archived
  const existing = stmtAllActiveNames.all() as { id: number; name: string; path: string }[];
  for (const proj of existing) {
    if (!existsSync(proj.path)) {
      stmtArchiveProject.run(proj.id);
    }
  }
}

export function createProject(
  name: string,
  path: string,
  description?: string,
): ProjectRecord | { error: string } {
  if (!name || !/^[a-zA-Z0-9._-]+$/.test(name)) {
    return { error: "Invalid project name" };
  }
  const existing = stmtProjectByName.get(name) as RawProjectRow | null;
  if (existing) return { error: "Project already exists" };

  const remote = existsSync(path) ? gitRemoteUrl(path) : null;
  const branch = existsSync(path) ? gitDefaultBranch(path) : null;

  try {
    stmtInsertProjectFull.run(name, path, description || "", remote, branch);
    logActivity(null, null, "clone", `Project added: ${name}`);
  } catch (e: unknown) {
    return { error: (e as Error).message || "Failed to create project" };
  }
  return getProjectByName(name) || { error: "Failed to retrieve created project" };
}

export function getAllProjects(opts?: {
  status?: string;
  search?: string;
  pinned?: boolean;
}): ProjectRecord[] {
  let rows: RawProjectRow[];

  if (opts?.pinned) {
    if (opts.status) {
      rows = stmtPinnedByStatus.all(opts.status) as RawProjectRow[];
    } else {
      rows = stmtPinnedProjects.all() as RawProjectRow[];
    }
  } else if (opts?.status && opts?.search) {
    const like = `%${opts.search}%`;
    rows = stmtProjectsByStatusSearch.all(opts.status, like, like) as RawProjectRow[];
  } else if (opts?.status) {
    rows = stmtProjectsByStatus.all(opts.status) as RawProjectRow[];
  } else if (opts?.search) {
    const like = `%${opts.search}%`;
    rows = stmtProjectsBySearch.all(like, like) as RawProjectRow[];
  } else {
    rows = stmtAllProjects.all() as RawProjectRow[];
  }

  return rows.map(rowToProject);
}

export function getProject(id: number): ProjectRecord | null {
  const row = stmtProjectById.get(id) as RawProjectRow | null;
  return row ? rowToProject(row) : null;
}

export function getProjectByName(name: string): ProjectRecord | null {
  const row = stmtProjectByName.get(name) as RawProjectRow | null;
  return row ? rowToProject(row) : null;
}

export function updateProject(
  id: number,
  updates: Partial<ProjectUpdate>
): ProjectRecord | null {
  const current = stmtProjectById.get(id) as RawProjectRow | null;
  if (!current) return null;

  const sets: string[] = [];
  const vals: (string | number)[] = [];

  if (updates.description !== undefined) {
    sets.push("description = ?");
    vals.push(updates.description);
  }
  if (updates.status !== undefined) {
    sets.push("status = ?");
    vals.push(updates.status);
  }
  if (updates.tags !== undefined) {
    sets.push("tags = ?");
    vals.push(JSON.stringify(updates.tags));
  }
  if (updates.pinned !== undefined) {
    sets.push("pinned = ?");
    vals.push(updates.pinned ? 1 : 0);
  }

  if (sets.length === 0) return getProject(id);

  sets.push("updated_at = datetime('now')");
  vals.push(id);

  db.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  return getProject(id);
}

export function deleteProject(id: number): boolean {
  const result = stmtDeleteProject.run(id);
  return result.changes > 0;
}

export function togglePin(id: number): boolean {
  const result = stmtTogglePin.run(id);
  return result.changes > 0;
}

// --- Session associations ---

export function attachSession(sessionName: string, projectId: number): void {
  stmtAttachSession.run(sessionName, projectId);
}

export function detachSession(sessionName: string, projectId: number): void {
  stmtDetachSession.run(sessionName, projectId);
}

export function getSessionProjects(sessionName: string): ProjectRecord[] {
  const rows = stmtSessionProjects.all(sessionName) as RawProjectRow[];
  return rows.map(rowToProject);
}

export function getProjectSessions(projectId: number): string[] {
  const rows = stmtProjectSessions.all(projectId) as { session_name: string }[];
  return rows.map((r) => r.session_name);
}

// --- Activity log ---

export function logActivity(
  projectId: number | null,
  sessionName: string | null,
  type: string,
  summary: string,
  detail?: string
): void {
  stmtInsertActivity.run(projectId, sessionName, type, summary, detail || "");
}

export function getActivity(opts?: {
  projectId?: number;
  limit?: number;
  offset?: number;
}): ActivityRecord[] {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  let rows: RawActivityRow[];
  if (opts?.projectId !== undefined) {
    rows = stmtActivityByProject.all(opts.projectId, limit, offset) as RawActivityRow[];
  } else {
    rows = stmtActivityAll.all(limit, offset) as RawActivityRow[];
  }
  return rows.map(rowToActivity);
}

// --- Stats ---

export function getProjectStats(projectId: number): {
  commits: number;
  sessions: number;
  lastActivity: string | null;
} {
  const commits = (stmtCommitCount.get(projectId) as { cnt: number }).cnt;
  const sessions = (stmtSessionCount.get(projectId) as { cnt: number }).cnt;
  const last = stmtLastActivity.get(projectId) as { created_at: string } | null;
  return {
    commits,
    sessions,
    lastActivity: last?.created_at ?? null,
  };
}
