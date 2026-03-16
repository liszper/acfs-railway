import { execAsUserSafe } from "../utils/shell.js";

export function getBeadsTriage(): Record<string, unknown> | { error: string } {
  const raw = execAsUserSafe("bv --robot-triage", 10000);
  if (raw === null) {
    return { error: "bv not available or triage failed" };
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { error: "Failed to parse bv triage output" };
  }
}

export function getBeadsReady(): unknown[] | { error: string } {
  const raw = execAsUserSafe("br ready --json", 5000);
  if (raw === null) {
    return { error: "br not available or ready check failed" };
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : { error: "Unexpected br ready output format" };
  } catch {
    return { error: "Failed to parse br ready output" };
  }
}

export function getBeadsNext(): Record<string, unknown> | { error: string } {
  const raw = execAsUserSafe("bv --robot-next", 5000);
  if (raw === null) {
    return { error: "bv not available or next check failed" };
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { error: "Failed to parse bv next output" };
  }
}
