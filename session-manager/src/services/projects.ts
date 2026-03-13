import { ACFS_USER } from "../config.js";
import { shellEscape, execAsUserSafe, execAsUserAsync } from "../utils/shell.js";
import type {
  ProjectInfo,
  GitStatus,
  FileChange,
  CommitInfo,
  FileTreeEntry,
  GitLogEntry,
  ProjectDetail,
} from "../types.js";

const PROJECTS_DIR = "/data/projects";

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateProjectName(name: string): string | null {
  if (!name || !/^[a-zA-Z0-9._-]+$/.test(name)) {
    return "Invalid project name: must match /^[a-zA-Z0-9._-]+$/";
  }
  return null;
}

function validateFilePath(p: string): string | null {
  if (p.includes("..")) return "Path traversal (..) not allowed";
  if (p.startsWith("/")) return "Absolute paths not allowed";
  return null;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

let projectListCache: ProjectInfo[] | null = null;
let projectListCacheTime = 0;
const PROJECT_CACHE_TTL = 15000;

// ---------------------------------------------------------------------------
// Internal git parsing
// ---------------------------------------------------------------------------

function parsePorcelainV2Branch(output: string): {
  branch: string | null;
  ahead: number;
  behind: number;
  staged: number;
  modified: number;
  untracked: number;
} {
  let branch: string | null = null;
  let ahead = 0;
  let behind = 0;
  let staged = 0;
  let modified = 0;
  let untracked = 0;

  for (const line of output.split("\n")) {
    if (line.startsWith("# branch.head ")) {
      branch = line.slice("# branch.head ".length);
    } else if (line.startsWith("# branch.ab ")) {
      const match = line.match(/\+(\d+)\s+-(\d+)/);
      if (match) {
        ahead = parseInt(match[1], 10);
        behind = parseInt(match[2], 10);
      }
    } else if (line.length > 0 && !line.startsWith("#")) {
      const x = line[0];
      const y = line[1];
      if (x === "?" && y === "?") {
        untracked++;
      } else {
        if (x !== " " && x !== "?") staged++;
        if (y !== " " && y !== "?") modified++;
      }
    }
  }

  return { branch, ahead, behind, staged, modified, untracked };
}

function parseCommitLine(line: string): CommitInfo | null {
  const parts = line.split("|");
  if (parts.length < 5) return null;
  return {
    hash: parts[0],
    shortHash: parts[1],
    message: parts[2],
    author: parts[3],
    date: new Date(parseInt(parts[4], 10) * 1000).toISOString(),
  };
}

function parsePorcelainV1(output: string): {
  staged: FileChange[];
  modified: FileChange[];
  untracked: string[];
  conflicts: string[];
} {
  const staged: FileChange[] = [];
  const modified: FileChange[] = [];
  const untracked: string[] = [];
  const conflicts: string[] = [];

  for (const line of output.split("\n")) {
    if (line.length < 3) continue;
    const x = line[0];
    const y = line[1];
    const filePath = line.slice(3);

    if (x === "U" || y === "U") {
      conflicts.push(filePath);
    } else if (x === "?" && y === "?") {
      untracked.push(filePath);
    } else {
      if (x !== " " && x !== "?") {
        staged.push({ path: filePath, status: x as FileChange["status"] });
      }
      if (y !== " " && y !== "?") {
        modified.push({ path: filePath, status: y as FileChange["status"] });
      }
    }
  }

  return { staged, modified, untracked, conflicts };
}

// ---------------------------------------------------------------------------
// 1. listProjects
// ---------------------------------------------------------------------------

export async function listProjects(): Promise<ProjectInfo[]> {
  const now = Date.now();
  if (projectListCache !== null && now - projectListCacheTime < PROJECT_CACHE_TTL) {
    return projectListCache;
  }

  const lsResult = await execAsUserAsync(`ls -1d ${PROJECTS_DIR}/*/`, 5000);
  if (lsResult.exitCode !== 0 || !lsResult.stdout.trim()) {
    projectListCache = [];
    projectListCacheTime = now;
    return [];
  }

  const dirs = lsResult.stdout
    .trim()
    .split("\n")
    .map((d) => d.replace(/\/+$/, ""));

  const projects: ProjectInfo[] = [];

  for (const dirPath of dirs) {
    const name = dirPath.split("/").pop() || "";
    if (!name) continue;

    const gitCheck = await execAsUserAsync(
      `git -C ${shellEscape(dirPath)} rev-parse --is-inside-work-tree`,
      5000
    );

    if (gitCheck.exitCode !== 0 || gitCheck.stdout.trim() !== "true") {
      projects.push({
        name,
        path: dirPath,
        isGitRepo: false,
        branch: null,
        remote: null,
        remoteUrl: null,
        ahead: 0,
        behind: 0,
        staged: 0,
        modified: 0,
        untracked: 0,
        clean: true,
        lastCommit: null,
      });
      continue;
    }

    const [statusResult, remoteResult, logResult] = await Promise.all([
      execAsUserAsync(
        `git -C ${shellEscape(dirPath)} status --porcelain=v2 --branch`,
        5000
      ),
      execAsUserAsync(
        `git -C ${shellEscape(dirPath)} remote get-url origin 2>/dev/null`,
        5000
      ),
      execAsUserAsync(
        `git -C ${shellEscape(dirPath)} log -1 --format=%H|%h|%s|%an|%at 2>/dev/null`,
        5000
      ),
    ]);

    const parsed = parsePorcelainV2Branch(statusResult.stdout);
    const remoteUrl =
      remoteResult.exitCode === 0 ? remoteResult.stdout.trim() || null : null;
    const lastCommit = parseCommitLine(logResult.stdout.trim());

    const clean =
      parsed.staged === 0 && parsed.modified === 0 && parsed.untracked === 0;

    projects.push({
      name,
      path: dirPath,
      isGitRepo: true,
      branch: parsed.branch,
      remote: remoteUrl ? "origin" : null,
      remoteUrl,
      ahead: parsed.ahead,
      behind: parsed.behind,
      staged: parsed.staged,
      modified: parsed.modified,
      untracked: parsed.untracked,
      clean,
      lastCommit,
    });
  }

  projectListCache = projects;
  projectListCacheTime = now;
  return projects;
}

// ---------------------------------------------------------------------------
// 2. getProjectDetail
// ---------------------------------------------------------------------------

export async function getProjectDetail(
  name: string
): Promise<ProjectDetail | { error: string }> {
  const nameErr = validateProjectName(name);
  if (nameErr) return { error: nameErr };

  const projectPath = `${PROJECTS_DIR}/${name}`;

  const existsCheck = await execAsUserAsync(
    `test -d ${shellEscape(projectPath)} && echo y || echo n`,
    5000
  );
  if (existsCheck.stdout.trim() !== "y") {
    return { error: `Project directory not found: ${name}` };
  }

  const [v1Result, v2Result, remoteResult, logResult] = await Promise.all([
    execAsUserAsync(
      `git -C ${shellEscape(projectPath)} status --porcelain=v1`,
      5000
    ),
    execAsUserAsync(
      `git -C ${shellEscape(projectPath)} status --porcelain=v2 --branch`,
      5000
    ),
    execAsUserAsync(
      `git -C ${shellEscape(projectPath)} remote get-url origin 2>/dev/null`,
      5000
    ),
    execAsUserAsync(
      `git -C ${shellEscape(projectPath)} log -1 --format=%H|%h|%s|%an|%at 2>/dev/null`,
      5000
    ),
  ]);

  const { staged, modified, untracked, conflicts } = parsePorcelainV1(
    v1Result.stdout
  );
  const branchInfo = parsePorcelainV2Branch(v2Result.stdout);
  const remoteUrl =
    remoteResult.exitCode === 0 ? remoteResult.stdout.trim() || null : null;
  const lastCommit = parseCommitLine(logResult.stdout.trim());

  const clean =
    staged.length === 0 &&
    modified.length === 0 &&
    untracked.length === 0 &&
    conflicts.length === 0;

  const gitStatus: GitStatus = {
    branch: branchInfo.branch,
    remote: remoteUrl ? "origin" : null,
    ahead: branchInfo.ahead,
    behind: branchInfo.behind,
    staged,
    modified,
    untracked,
    conflicts,
    clean,
  };

  const info: ProjectInfo = {
    name,
    path: projectPath,
    isGitRepo: true,
    branch: branchInfo.branch,
    remote: remoteUrl ? "origin" : null,
    remoteUrl,
    ahead: branchInfo.ahead,
    behind: branchInfo.behind,
    staged: staged.length,
    modified: modified.length,
    untracked: untracked.length,
    clean,
    lastCommit,
  };

  return { info, status: gitStatus };
}

// ---------------------------------------------------------------------------
// 3. getFileTree
// ---------------------------------------------------------------------------

export async function getFileTree(
  name: string,
  subPath?: string
): Promise<FileTreeEntry[] | { error: string }> {
  const nameErr = validateProjectName(name);
  if (nameErr) return { error: nameErr };

  if (subPath) {
    const pathErr = validateFilePath(subPath);
    if (pathErr) return { error: pathErr };
  }

  const projectRoot = `${PROJECTS_DIR}/${name}`;
  const fullDir = subPath ? `${projectRoot}/${subPath}` : projectRoot;

  const existsCheck = await execAsUserAsync(
    `test -d ${shellEscape(fullDir)} && echo y || echo n`,
    5000
  );
  if (existsCheck.stdout.trim() !== "y") {
    return { error: `Directory not found: ${subPath || name}` };
  }

  const lsResult = await execAsUserAsync(
    `ls -1ap ${shellEscape(fullDir)}`,
    5000
  );
  if (lsResult.exitCode !== 0) {
    return { error: "Failed to list directory" };
  }

  const gitStatusResult = await execAsUserAsync(
    `git -C ${shellEscape(projectRoot)} status --porcelain=v1 2>/dev/null`,
    5000
  );
  const gitStatusMap = new Map<string, string>();
  if (gitStatusResult.exitCode === 0) {
    for (const line of gitStatusResult.stdout.split("\n")) {
      if (line.length < 3) continue;
      const xy = line.slice(0, 2);
      const fp = line.slice(3);
      gitStatusMap.set(fp, xy.trim());
    }
  }

  const entries: FileTreeEntry[] = [];
  const relPrefix = subPath ? `${subPath}/` : "";

  for (const raw of lsResult.stdout.split("\n")) {
    const entry = raw.trim();
    if (!entry) continue;

    const isDir = entry.endsWith("/");
    const entryName = isDir ? entry.slice(0, -1) : entry;

    if (entryName === "." || entryName === ".." || entryName === ".git") continue;

    const relativePath = `${relPrefix}${entryName}`;
    const gitSt = gitStatusMap.get(relativePath) || gitStatusMap.get(`${relativePath}/`);

    entries.push({
      name: entryName,
      path: relativePath,
      isDir,
      gitStatus: gitSt,
    });
  }

  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return entries;
}

// ---------------------------------------------------------------------------
// 4. cloneRepo
// ---------------------------------------------------------------------------

export async function cloneRepo(
  url: string,
  name?: string
): Promise<{ ok: boolean; name: string; error?: string }> {
  let repoUrl = url.trim();

  if (/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(repoUrl)) {
    repoUrl = `https://github.com/${repoUrl}.git`;
  }

  if (!repoUrl.startsWith("https://") && !repoUrl.startsWith("git@")) {
    return { ok: false, name: "", error: "URL must start with https:// or git@, or be owner/repo shorthand" };
  }

  let repoName = name?.trim() || "";
  if (!repoName) {
    const lastSegment = repoUrl.split("/").pop() || "";
    repoName = lastSegment.replace(/\.git$/, "");
  }

  const nameErr = validateProjectName(repoName);
  if (nameErr) return { ok: false, name: repoName, error: nameErr };

  const targetPath = `${PROJECTS_DIR}/${repoName}`;
  const existsCheck = await execAsUserAsync(
    `test -d ${shellEscape(targetPath)} && echo y || echo n`,
    5000
  );
  if (existsCheck.stdout.trim() === "y") {
    return { ok: false, name: repoName, error: `Directory already exists: ${repoName}` };
  }

  const result = await execAsUserAsync(
    `git clone ${shellEscape(repoUrl)} ${shellEscape(targetPath)}`,
    60000
  );

  if (result.exitCode !== 0) {
    return {
      ok: false,
      name: repoName,
      error: result.stderr.trim() || "Clone failed",
    };
  }

  projectListCache = null;
  return { ok: true, name: repoName };
}

// ---------------------------------------------------------------------------
// 5. stageFiles
// ---------------------------------------------------------------------------

export async function stageFiles(
  name: string,
  files: string[]
): Promise<{ ok: boolean; error?: string }> {
  const nameErr = validateProjectName(name);
  if (nameErr) return { ok: false, error: nameErr };

  if (!files.length) return { ok: false, error: "No files specified" };

  for (const f of files) {
    const pathErr = validateFilePath(f);
    if (pathErr) return { ok: false, error: `${pathErr}: ${f}` };
  }

  const projectPath = `${PROJECTS_DIR}/${name}`;
  const escaped = files.map((f) => shellEscape(f)).join(" ");
  const result = await execAsUserAsync(
    `git -C ${shellEscape(projectPath)} add ${escaped}`,
    10000
  );

  if (result.exitCode !== 0) {
    return { ok: false, error: result.stderr.trim() || "Stage failed" };
  }

  projectListCache = null;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 6. unstageFiles
// ---------------------------------------------------------------------------

export async function unstageFiles(
  name: string,
  files: string[]
): Promise<{ ok: boolean; error?: string }> {
  const nameErr = validateProjectName(name);
  if (nameErr) return { ok: false, error: nameErr };

  if (!files.length) return { ok: false, error: "No files specified" };

  for (const f of files) {
    const pathErr = validateFilePath(f);
    if (pathErr) return { ok: false, error: `${pathErr}: ${f}` };
  }

  const projectPath = `${PROJECTS_DIR}/${name}`;
  const escaped = files.map((f) => shellEscape(f)).join(" ");
  const result = await execAsUserAsync(
    `git -C ${shellEscape(projectPath)} restore --staged ${escaped}`,
    10000
  );

  if (result.exitCode !== 0) {
    return { ok: false, error: result.stderr.trim() || "Unstage failed" };
  }

  projectListCache = null;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 7. stageAll
// ---------------------------------------------------------------------------

export async function stageAll(
  name: string
): Promise<{ ok: boolean; error?: string }> {
  const nameErr = validateProjectName(name);
  if (nameErr) return { ok: false, error: nameErr };

  const projectPath = `${PROJECTS_DIR}/${name}`;
  const result = await execAsUserAsync(
    `git -C ${shellEscape(projectPath)} add -A`,
    10000
  );

  if (result.exitCode !== 0) {
    return { ok: false, error: result.stderr.trim() || "Stage all failed" };
  }

  projectListCache = null;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 8. commitChanges
// ---------------------------------------------------------------------------

export async function commitChanges(
  name: string,
  message: string
): Promise<{ ok: boolean; hash?: string; error?: string }> {
  const nameErr = validateProjectName(name);
  if (nameErr) return { ok: false, error: nameErr };

  if (!message || message.length > 500) {
    return { ok: false, error: "Commit message must be 1-500 characters" };
  }
  if (message.includes("\0")) {
    return { ok: false, error: "Commit message contains null bytes" };
  }

  const projectPath = `${PROJECTS_DIR}/${name}`;
  const result = await execAsUserAsync(
    `git -C ${shellEscape(projectPath)} commit -m ${shellEscape(message)}`,
    10000
  );

  if (result.exitCode !== 0) {
    return {
      ok: false,
      error: result.stderr.trim() || result.stdout.trim() || "Commit failed",
    };
  }

  const hashMatch = result.stdout.match(/\[[\w/.-]+\s+([a-f0-9]+)\]/);
  const hash = hashMatch ? hashMatch[1] : undefined;

  projectListCache = null;
  return { ok: true, hash };
}

// ---------------------------------------------------------------------------
// 9. pushChanges
// ---------------------------------------------------------------------------

export async function pushChanges(
  name: string
): Promise<{ ok: boolean; error?: string }> {
  const nameErr = validateProjectName(name);
  if (nameErr) return { ok: false, error: nameErr };

  const projectPath = `${PROJECTS_DIR}/${name}`;
  const result = await execAsUserAsync(
    `git -C ${shellEscape(projectPath)} push`,
    30000
  );

  if (result.exitCode !== 0) {
    return {
      ok: false,
      error: result.stderr.trim() || "Push failed",
    };
  }

  projectListCache = null;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 10. pullChanges
// ---------------------------------------------------------------------------

export async function pullChanges(
  name: string
): Promise<{ ok: boolean; error?: string }> {
  const nameErr = validateProjectName(name);
  if (nameErr) return { ok: false, error: nameErr };

  const projectPath = `${PROJECTS_DIR}/${name}`;
  const result = await execAsUserAsync(
    `git -C ${shellEscape(projectPath)} pull --rebase`,
    30000
  );

  if (result.exitCode !== 0) {
    return {
      ok: false,
      error: result.stderr.trim() || "Pull failed",
    };
  }

  projectListCache = null;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 11. getLog
// ---------------------------------------------------------------------------

export async function getLog(
  name: string,
  limit = 10
): Promise<GitLogEntry[] | { error: string }> {
  const nameErr = validateProjectName(name);
  if (nameErr) return { error: nameErr };

  const safeLimit = Math.max(1, Math.min(limit, 100));
  const projectPath = `${PROJECTS_DIR}/${name}`;

  const result = await execAsUserAsync(
    `git -C ${shellEscape(projectPath)} log -${safeLimit} --format=%H|%h|%s|%an|%at`,
    10000
  );

  if (result.exitCode !== 0) {
    return { error: result.stderr.trim() || "Log failed" };
  }

  const entries: GitLogEntry[] = [];
  for (const line of result.stdout.trim().split("\n")) {
    if (!line) continue;
    const parsed = parseCommitLine(line);
    if (parsed) {
      entries.push(parsed);
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// 12. getBranches
// ---------------------------------------------------------------------------

export async function getBranches(
  name: string
): Promise<{ current: string; branches: string[] } | { error: string }> {
  const nameErr = validateProjectName(name);
  if (nameErr) return { error: nameErr };

  const projectPath = `${PROJECTS_DIR}/${name}`;
  const result = await execAsUserAsync(
    `git -C ${shellEscape(projectPath)} branch -a --format=%(HEAD)|%(refname:short)`,
    5000
  );

  if (result.exitCode !== 0) {
    return { error: result.stderr.trim() || "Branch listing failed" };
  }

  let current = "";
  const branches: string[] = [];

  for (const line of result.stdout.trim().split("\n")) {
    if (!line) continue;
    const [head, branchName] = line.split("|");
    if (!branchName) continue;
    branches.push(branchName);
    if (head === "*") {
      current = branchName;
    }
  }

  return { current, branches };
}

// ---------------------------------------------------------------------------
// 13. getFileDiff
// ---------------------------------------------------------------------------

export async function getFileDiff(
  name: string,
  file: string,
  staged?: boolean
): Promise<{ diff: string } | { error: string }> {
  const nameErr = validateProjectName(name);
  if (nameErr) return { error: nameErr };

  const pathErr = validateFilePath(file);
  if (pathErr) return { error: pathErr };

  const projectPath = `${PROJECTS_DIR}/${name}`;
  const cachedArg = staged ? " --cached" : "";
  const result = await execAsUserAsync(
    `git -C ${shellEscape(projectPath)} diff${cachedArg} ${shellEscape(file)}`,
    10000
  );

  if (result.exitCode !== 0) {
    return { error: result.stderr.trim() || "Diff failed" };
  }

  const MAX_DIFF_LENGTH = 50000;
  let diff = result.stdout;
  if (diff.length > MAX_DIFF_LENGTH) {
    diff = diff.slice(0, MAX_DIFF_LENGTH) + "\n\n... [truncated at 50000 chars]";
  }

  return { diff };
}
