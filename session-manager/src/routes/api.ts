import type { IncomingMessage, ServerResponse } from "node:http";
import { readBody, jsonResponse, requireJsonContentType } from "../utils/http.js";
import { getTmuxSessions, ensureTmuxSession, killSession } from "../services/sessions.js";
import { startTtydForSession } from "../services/ttyd.js";
import { ntmSpawn, ntmSend, ntmInterrupt, ntmStatus } from "../services/ntm.js";
import {
  getToolStatus,
  getSystemStats,
  getEnvStatus,
  cassSearch,
  cautUsage,
} from "../services/tools.js";
import {
  getSecretsStatus,
  generateSshKey,
  uploadSshKeyToGithub,
  setGitConfig,
} from "../services/secrets.js";
import {
  listProjects,
  getProjectDetail,
  getFileTree,
  cloneRepo,
  stageFiles,
  unstageFiles,
  stageAll,
  commitChanges,
  pushChanges,
  pullChanges,
  getLog,
  getBranches,
  getFileDiff,
  autoPush,
  autoPushDryRun,
} from "../services/projects.js";
import { getAgentProcesses, getAgentStats } from "../services/agents.js";
import { getBeadsTriage, getBeadsReady, getBeadsNext } from "../services/beads.js";
import { getRecentEvents } from "../services/events.js";
import type { NtmSpawnOpts, GitConfigInput } from "../types.js";

export function handleListSessions(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  jsonResponse(res, 200, getTmuxSessions());
}

export function handleCreateSession(
  req: IncomingMessage,
  res: ServerResponse
): void {
  readBody(req)
    .then((body) => {
      const { name, cwd } = body;
      if (!name || typeof name !== "string" || !/^[a-zA-Z0-9_-]+$/.test(name)) {
        jsonResponse(res, 400, { error: "Invalid session name" });
        return;
      }
      const sessionCwd = typeof cwd === "string" ? cwd : undefined;
      ensureTmuxSession(name, sessionCwd);
      const port = startTtydForSession(name);
      setTimeout(() => {
        jsonResponse(res, 201, { name, url: `/s/${name}/`, port });
      }, 500);
    })
    .catch(() => {
      jsonResponse(res, 400, { error: "Invalid request" });
    });
}

export function handleDeleteSession(
  _req: IncomingMessage,
  res: ServerResponse,
  sessionName: string
): void {
  killSession(sessionName);
  jsonResponse(res, 200, { ok: true });
}

export function handleNtmSpawn(
  req: IncomingMessage,
  res: ServerResponse
): void {
  readBody(req)
    .then((body) => {
      const { name, recipe, template, cc, cod, gmi, prompt } = body as Record<
        string,
        unknown
      >;
      if (
        !name ||
        typeof name !== "string" ||
        !/^[a-zA-Z0-9_-]+$/.test(name)
      ) {
        jsonResponse(res, 400, { error: "Invalid session name" });
        return;
      }
      const opts: NtmSpawnOpts = {
        recipe: recipe as string | undefined,
        template: template as string | undefined,
        cc: cc as number | undefined,
        cod: cod as number | undefined,
        gmi: gmi as number | undefined,
        prompt: prompt as string | undefined,
      };
      const result = ntmSpawn(name, opts);
      if (result.error) {
        jsonResponse(res, 500, result);
        return;
      }
      ensureTmuxSession(name);
      startTtydForSession(name);
      setTimeout(() => {
        jsonResponse(res, 201, result);
      }, 500);
    })
    .catch(() => {
      jsonResponse(res, 400, { error: "Invalid request body" });
    });
}

export function handleNtmSend(
  req: IncomingMessage,
  res: ServerResponse
): void {
  readBody(req)
    .then((body) => {
      const { session, prompt, target } = body as Record<string, unknown>;
      if (!session || !prompt) {
        jsonResponse(res, 400, {
          error: "session and prompt are required",
        });
        return;
      }
      const result = ntmSend(
        session as string,
        prompt as string,
        target as string | undefined
      );
      jsonResponse(res, result.error ? 500 : 200, result);
    })
    .catch(() => {
      jsonResponse(res, 400, { error: "Invalid request body" });
    });
}

export function handleNtmInterrupt(
  req: IncomingMessage,
  res: ServerResponse
): void {
  readBody(req)
    .then((body) => {
      const { session } = body as Record<string, unknown>;
      if (!session) {
        jsonResponse(res, 400, { error: "session is required" });
        return;
      }
      const result = ntmInterrupt(session as string);
      jsonResponse(res, result.error ? 500 : 200, result);
    })
    .catch(() => {
      jsonResponse(res, 400, { error: "Invalid request body" });
    });
}

export function handleNtmStatus(
  _req: IncomingMessage,
  res: ServerResponse,
  sessionName: string
): void {
  const result = ntmStatus(sessionName);
  jsonResponse(res, "error" in result ? 500 : 200, result);
}

export function handleToolStatus(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  jsonResponse(res, 200, getToolStatus());
}

export function handleSystemStats(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  jsonResponse(res, 200, getSystemStats());
}

export function handleEnvStatus(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  jsonResponse(res, 200, getEnvStatus());
}

export function handleCassSearch(
  req: IncomingMessage,
  res: ServerResponse
): void {
  readBody(req)
    .then((body) => {
      const { query } = body as Record<string, unknown>;
      if (!query) {
        jsonResponse(res, 400, { error: "query is required" });
        return;
      }
      try {
        const result = cassSearch(query as string);
        jsonResponse(res, 200, result);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "cass search failed";
        jsonResponse(res, 500, { error: msg });
      }
    })
    .catch(() => {
      jsonResponse(res, 400, { error: "Invalid request body" });
    });
}

export function handleCautUsage(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  try {
    const result = cautUsage();
    jsonResponse(res, 200, result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "caut usage failed";
    jsonResponse(res, 500, { error: msg });
  }
}

export async function handleSecretsStatus(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const status = await getSecretsStatus();
    jsonResponse(res, 200, status);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "secrets status failed";
    jsonResponse(res, 500, { error: msg });
  }
}

export async function handleSshGenerate(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (!requireJsonContentType(req, res)) return;
  try {
    const body = await readBody(req);
    const result = await generateSshKey(!!body.force);
    if ("error" in result) {
      jsonResponse(res, 400, result);
    } else {
      jsonResponse(res, result.created ? 201 : 200, result);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "ssh key generation failed";
    jsonResponse(res, 500, { error: msg });
  }
}

export async function handleSshGithub(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (!requireJsonContentType(req, res)) return;
  try {
    await readBody(req);
    const result = await uploadSshKeyToGithub();
    jsonResponse(res, result.ok ? 200 : 400, result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "ssh github upload failed";
    jsonResponse(res, 500, { error: msg });
  }
}

export async function handleGitConfig(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (!requireJsonContentType(req, res)) return;
  try {
    const body = await readBody(req);
    const input: GitConfigInput = {
      name: typeof body.name === "string" ? body.name.trim() : undefined,
      email: typeof body.email === "string" ? body.email.trim() : undefined,
    };
    const result = await setGitConfig(input);
    jsonResponse(res, result.ok ? 200 : 400, result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "git config failed";
    jsonResponse(res, 500, { error: msg });
  }
}

// --- Projects handlers ---

export async function handleListProjects(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const projects = await listProjects();
    jsonResponse(res, 200, projects);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "failed to list projects";
    jsonResponse(res, 500, { error: msg });
  }
}

export async function handleCloneProject(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (!requireJsonContentType(req, res)) return;
  try {
    const body = await readBody(req);
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : undefined;
    if (!url) {
      jsonResponse(res, 400, { error: "url is required" });
      return;
    }
    const result = await cloneRepo(url, name);
    jsonResponse(res, result.ok ? 201 : 400, result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "clone failed";
    jsonResponse(res, 500, { error: msg });
  }
}

export async function handleProjectDetail(
  _req: IncomingMessage,
  res: ServerResponse,
  name: string
): Promise<void> {
  try {
    const result = await getProjectDetail(name);
    const status = "error" in result ? 400 : 200;
    jsonResponse(res, status, result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "failed to get project detail";
    jsonResponse(res, 500, { error: msg });
  }
}

export async function handleProjectTree(
  req: IncomingMessage,
  res: ServerResponse,
  name: string
): Promise<void> {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const subPath = url.searchParams.get("path") || undefined;
    const result = await getFileTree(name, subPath);
    const status = "error" in result ? 400 : 200;
    jsonResponse(res, status, result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "failed to get file tree";
    jsonResponse(res, 500, { error: msg });
  }
}

export async function handleProjectStage(
  req: IncomingMessage,
  res: ServerResponse,
  name: string
): Promise<void> {
  if (!requireJsonContentType(req, res)) return;
  try {
    const body = await readBody(req);
    const files = Array.isArray(body.files) ? body.files : [];
    const result = await stageFiles(name, files);
    jsonResponse(res, result.ok ? 200 : 400, result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "stage failed";
    jsonResponse(res, 500, { error: msg });
  }
}

export async function handleProjectUnstage(
  req: IncomingMessage,
  res: ServerResponse,
  name: string
): Promise<void> {
  if (!requireJsonContentType(req, res)) return;
  try {
    const body = await readBody(req);
    const files = Array.isArray(body.files) ? body.files : [];
    const result = await unstageFiles(name, files);
    jsonResponse(res, result.ok ? 200 : 400, result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unstage failed";
    jsonResponse(res, 500, { error: msg });
  }
}

export async function handleProjectStageAll(
  req: IncomingMessage,
  res: ServerResponse,
  name: string
): Promise<void> {
  if (!requireJsonContentType(req, res)) return;
  try {
    await readBody(req);
    const result = await stageAll(name);
    jsonResponse(res, result.ok ? 200 : 400, result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "stage all failed";
    jsonResponse(res, 500, { error: msg });
  }
}

export async function handleProjectCommit(
  req: IncomingMessage,
  res: ServerResponse,
  name: string
): Promise<void> {
  if (!requireJsonContentType(req, res)) return;
  try {
    const body = await readBody(req);
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      jsonResponse(res, 400, { error: "message is required" });
      return;
    }
    const result = await commitChanges(name, message);
    jsonResponse(res, result.ok ? 200 : 400, result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "commit failed";
    jsonResponse(res, 500, { error: msg });
  }
}

export async function handleProjectPush(
  req: IncomingMessage,
  res: ServerResponse,
  name: string
): Promise<void> {
  if (!requireJsonContentType(req, res)) return;
  try {
    await readBody(req);
    const result = await pushChanges(name);
    jsonResponse(res, result.ok ? 200 : 400, result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "push failed";
    jsonResponse(res, 500, { error: msg });
  }
}

export async function handleProjectPull(
  req: IncomingMessage,
  res: ServerResponse,
  name: string
): Promise<void> {
  if (!requireJsonContentType(req, res)) return;
  try {
    await readBody(req);
    const result = await pullChanges(name);
    jsonResponse(res, result.ok ? 200 : 400, result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "pull failed";
    jsonResponse(res, 500, { error: msg });
  }
}

export async function handleProjectLog(
  req: IncomingMessage,
  res: ServerResponse,
  name: string
): Promise<void> {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const limitStr = url.searchParams.get("limit");
    const limit = limitStr ? parseInt(limitStr, 10) : 10;
    const result = await getLog(name, limit);
    const status = "error" in result ? 400 : 200;
    jsonResponse(res, status, result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "log failed";
    jsonResponse(res, 500, { error: msg });
  }
}

export async function handleProjectBranches(
  _req: IncomingMessage,
  res: ServerResponse,
  name: string
): Promise<void> {
  try {
    const result = await getBranches(name);
    const status = "error" in result ? 400 : 200;
    jsonResponse(res, status, result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "branches failed";
    jsonResponse(res, 500, { error: msg });
  }
}

export async function handleProjectDiff(
  req: IncomingMessage,
  res: ServerResponse,
  name: string
): Promise<void> {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const file = url.searchParams.get("file") || "";
    const staged = url.searchParams.get("staged") === "true";
    if (!file) {
      jsonResponse(res, 400, { error: "file parameter required" });
      return;
    }
    const result = await getFileDiff(name, file, staged);
    const status = "error" in result ? 400 : 200;
    jsonResponse(res, status, result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "diff failed";
    jsonResponse(res, 500, { error: msg });
  }
}

// --- Agent handlers ---

export function handleAgentProcesses(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  try {
    jsonResponse(res, 200, getAgentProcesses());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "agent processes failed";
    jsonResponse(res, 500, { error: msg });
  }
}

export function handleAgentStats(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  try {
    jsonResponse(res, 200, getAgentStats());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "agent stats failed";
    jsonResponse(res, 500, { error: msg });
  }
}

// --- Beads handlers ---

export function handleBeadsTriage(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  try {
    const result = getBeadsTriage();
    const status = "error" in result ? 500 : 200;
    jsonResponse(res, status, result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "beads triage failed";
    jsonResponse(res, 500, { error: msg });
  }
}

export function handleBeadsReady(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  try {
    const result = getBeadsReady();
    const status = "error" in result && !Array.isArray(result) ? 500 : 200;
    jsonResponse(res, status, result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "beads ready failed";
    jsonResponse(res, 500, { error: msg });
  }
}

export function handleBeadsNext(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  try {
    const result = getBeadsNext();
    const status = "error" in result ? 500 : 200;
    jsonResponse(res, status, result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "beads next failed";
    jsonResponse(res, 500, { error: msg });
  }
}

// --- Events handlers ---

export function handleRecentEvents(
  req: IncomingMessage,
  res: ServerResponse
): void {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const limitStr = url.searchParams.get("limit");
    const offsetStr = url.searchParams.get("offset");
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const offset = offsetStr ? parseInt(offsetStr, 10) : 0;
    jsonResponse(res, 200, getRecentEvents(limit, offset));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "recent events failed";
    jsonResponse(res, 500, { error: msg });
  }
}

// --- Auto-push handlers ---

export function handleAutoPush(
  req: IncomingMessage,
  res: ServerResponse
): void {
  readBody(req)
    .then((body) => {
      const project =
        typeof body.project === "string" ? body.project.trim() : undefined;
      const result = autoPush(project || undefined);
      jsonResponse(res, result.ok ? 200 : 500, result);
    })
    .catch(() => {
      jsonResponse(res, 400, { error: "Invalid request body" });
    });
}

export async function handleAutoPushStatus(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const project = url.searchParams.get("project") || undefined;
    const result = await autoPushDryRun(project);
    jsonResponse(res, 200, result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "auto-push status failed";
    jsonResponse(res, 500, { error: msg });
  }
}
