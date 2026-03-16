import { existsSync, readFileSync } from "node:fs";

const AUDIT_LOG_PATH = "/data/audit/agent-actions.jsonl";

export interface AuditEvent {
  timestamp: string;
  action: string;
  path: string;
  agent?: string;
  detail?: string;
  branch?: string;
  sha?: string;
  size?: number;
}

export function getRecentEvents(limit = 50, offset = 0): AuditEvent[] {
  if (!existsSync(AUDIT_LOG_PATH)) {
    return [];
  }

  try {
    const content = readFileSync(AUDIT_LOG_PATH, "utf8");
    const lines = content.trim().split("\n").filter((l) => l.length > 0);

    // Reverse for newest-first ordering
    lines.reverse();

    const safeLimit = Math.max(1, Math.min(limit, 500));
    const safeOffset = Math.max(0, offset);
    const sliced = lines.slice(safeOffset, safeOffset + safeLimit);

    const events: AuditEvent[] = [];
    for (const line of sliced) {
      try {
        const parsed = JSON.parse(line) as AuditEvent;
        events.push(parsed);
      } catch {
        // Skip malformed lines
      }
    }

    return events;
  } catch {
    return [];
  }
}
