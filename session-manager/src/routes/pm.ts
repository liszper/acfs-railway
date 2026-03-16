import type { IncomingMessage, ServerResponse } from "node:http";
import { jsonResponse, readBody, requireJsonContentType } from "../utils/http.js";
import {
  getAllProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  togglePin,
  syncProjects,
  attachSession,
  detachSession,
  getSessionProjects,
  getActivity,
  logActivity,
  getProjectStats,
} from "../services/pm.js";

export function handlePmListProjects(
  req: IncomingMessage,
  res: ServerResponse
): void {
  const url = new URL(req.url || "/", "http://localhost");
  const status = url.searchParams.get("status") || undefined;
  const search = url.searchParams.get("search") || undefined;
  const pinned = url.searchParams.get("pinned") === "true" ? true : undefined;
  jsonResponse(res, 200, getAllProjects({ status, search, pinned }));
}

export function handlePmCreateProject(
  req: IncomingMessage,
  res: ServerResponse
): void {
  if (!requireJsonContentType(req, res)) return;
  readBody(req)
    .then((body) => {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const path = typeof body.path === "string" ? body.path.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      if (!name) { jsonResponse(res, 400, { error: "name is required" }); return; }
      if (!path) { jsonResponse(res, 400, { error: "path is required" }); return; }
      const result = createProject(name, path, description);
      if ("error" in result) { jsonResponse(res, 400, result); return; }
      jsonResponse(res, 201, result);
    })
    .catch(() => { jsonResponse(res, 400, { error: "Invalid request body" }); });
}

export function handlePmGetProject(
  _req: IncomingMessage,
  res: ServerResponse,
  id: number
): void {
  const project = getProject(id);
  if (!project) {
    jsonResponse(res, 404, { error: "Project not found" });
    return;
  }
  const stats = getProjectStats(id);
  jsonResponse(res, 200, { ...project, stats });
}

export function handlePmUpdateProject(
  req: IncomingMessage,
  res: ServerResponse,
  id: number
): void {
  if (!requireJsonContentType(req, res)) return;
  readBody(req)
    .then((body) => {
      const updates: Record<string, unknown> = {};
      if (body.description !== undefined) updates.description = body.description;
      if (body.status !== undefined) updates.status = body.status;
      if (body.tags !== undefined) updates.tags = body.tags;
      if (body.pinned !== undefined) updates.pinned = body.pinned;

      const result = updateProject(id, updates as any);
      if (!result) {
        jsonResponse(res, 404, { error: "Project not found" });
        return;
      }
      jsonResponse(res, 200, result);
    })
    .catch(() => {
      jsonResponse(res, 400, { error: "Invalid request body" });
    });
}

export function handlePmDeleteProject(
  _req: IncomingMessage,
  res: ServerResponse,
  id: number
): void {
  const ok = deleteProject(id);
  if (!ok) {
    jsonResponse(res, 404, { error: "Project not found" });
    return;
  }
  jsonResponse(res, 200, { ok: true });
}

export function handlePmTogglePin(
  _req: IncomingMessage,
  res: ServerResponse,
  id: number
): void {
  const ok = togglePin(id);
  if (!ok) {
    jsonResponse(res, 404, { error: "Project not found" });
    return;
  }
  const project = getProject(id);
  jsonResponse(res, 200, project);
}

export function handlePmSync(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  syncProjects();
  const projects = getAllProjects();
  jsonResponse(res, 200, { ok: true, count: projects.length });
}

export function handlePmAttachSession(
  _req: IncomingMessage,
  res: ServerResponse,
  id: number,
  sessionName: string
): void {
  const project = getProject(id);
  if (!project) {
    jsonResponse(res, 404, { error: "Project not found" });
    return;
  }
  attachSession(sessionName, id);
  jsonResponse(res, 200, { ok: true });
}

export function handlePmDetachSession(
  _req: IncomingMessage,
  res: ServerResponse,
  id: number,
  sessionName: string
): void {
  detachSession(sessionName, id);
  jsonResponse(res, 200, { ok: true });
}

export function handlePmProjectActivity(
  req: IncomingMessage,
  res: ServerResponse,
  id: number
): void {
  const url = new URL(req.url || "/", "http://localhost");
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);
  jsonResponse(res, 200, getActivity({ projectId: id, limit, offset }));
}

export function handlePmAllActivity(
  req: IncomingMessage,
  res: ServerResponse
): void {
  const url = new URL(req.url || "/", "http://localhost");
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);
  jsonResponse(res, 200, getActivity({ limit, offset }));
}

export function handlePmLogActivity(
  req: IncomingMessage,
  res: ServerResponse,
  id: number
): void {
  if (!requireJsonContentType(req, res)) return;
  readBody(req)
    .then((body) => {
      const { type, summary, detail } = body as {
        type?: string;
        summary?: string;
        detail?: string;
      };
      if (!type || !summary) {
        jsonResponse(res, 400, { error: "type and summary are required" });
        return;
      }
      logActivity(id, null, type as string, summary as string, detail || "");
      jsonResponse(res, 201, { ok: true });
    })
    .catch(() => {
      jsonResponse(res, 400, { error: "Invalid request body" });
    });
}

export function handlePmSessionProjects(
  _req: IncomingMessage,
  res: ServerResponse,
  sessionName: string
): void {
  jsonResponse(res, 200, getSessionProjects(sessionName));
}
