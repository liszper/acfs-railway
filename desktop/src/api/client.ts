import { invoke } from "@tauri-apps/api/core";

export async function apiGet<T = unknown>(path: string): Promise<T> {
  return invoke<T>("api_request", { method: "GET", path, body: null });
}

export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  return invoke<T>("api_request", { method: "POST", path, body: body ?? null });
}

export async function apiDelete<T = unknown>(path: string): Promise<T> {
  return invoke<T>("api_request", { method: "DELETE", path, body: null });
}

export async function apiPut<T = unknown>(path: string, body?: unknown): Promise<T> {
  return invoke<T>("api_request", { method: "PUT", path, body: body ?? null });
}
