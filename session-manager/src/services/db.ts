import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";

function getDbPath(): string {
  if (existsSync("/data")) {
    return "/data/projects.db";
  }
  return "./projects.db";
}

const dbPath = getDbPath();
const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
if (dir && !existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

export const db = new Database(dbPath);

db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA foreign_keys = ON");

function migrate(): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      path TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived', 'template')),
      tags TEXT DEFAULT '[]',
      remote_url TEXT,
      default_branch TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      last_opened_at TEXT,
      pinned INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS session_projects (
      session_name TEXT NOT NULL,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      attached_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (session_name, project_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      session_name TEXT,
      type TEXT NOT NULL CHECK(type IN ('commit', 'branch', 'session_start', 'session_end', 'agent_run', 'clone', 'note', 'status_change')),
      summary TEXT NOT NULL,
      detail TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run("CREATE INDEX IF NOT EXISTS idx_activity_project ON activity(project_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_session_projects_session ON session_projects(session_name)");

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      name TEXT PRIMARY KEY,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      cwd TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'terminated')),
      created_at TEXT DEFAULT (datetime('now')),
      terminated_at TEXT
    )
  `);

  db.run("CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)");
}

migrate();
