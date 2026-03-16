import { useEffect, useState, useRef, useCallback } from "react";
import { apiGet } from "../api/client";
import type { ActivityRecord, AuditEvent } from "../api/types";

// ── Styles ──────────────────────────────────────────────────────────────────

const S = {
  panel: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
    fontSize: "0.65rem",
    color: "var(--text)",
  },
  tabBar: {
    display: "flex",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  tab: (active: boolean) => ({
    flex: 1,
    padding: "6px 0",
    textAlign: "center" as const,
    fontSize: "0.55rem",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: active ? "var(--accent)" : "var(--text-muted)",
    background: active ? "var(--bg-2)" : "transparent",
    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
    cursor: "pointer",
    border: "none",
    borderBottomWidth: "2px",
    borderBottomStyle: "solid" as const,
    borderBottomColor: active ? "var(--accent)" : "transparent",
  }),
  list: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "4px 8px",
  },
  row: {
    display: "flex",
    alignItems: "flex-start" as const,
    gap: "6px",
    padding: "4px 0",
    borderBottom: "1px solid var(--border-subtle)",
  },
  badge: (color: string) => ({
    display: "inline-flex",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    width: "16px",
    height: "16px",
    borderRadius: "3px",
    fontSize: "0.5rem",
    fontWeight: 700,
    color: "#fff",
    background: color,
    flexShrink: 0,
  }),
  summary: {
    flex: 1,
    fontSize: "0.6rem",
    color: "var(--text)",
    lineHeight: 1.3,
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
    whiteSpace: "nowrap" as const,
  },
  meta: {
    fontSize: "0.5rem",
    color: "var(--text-dim)",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  },
  context: {
    fontSize: "0.5rem",
    color: "var(--text-muted)",
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
    whiteSpace: "nowrap" as const,
  },
  loadMore: {
    padding: "4px 8px",
    fontSize: "0.55rem",
    background: "var(--bg-2)",
    color: "var(--text-muted)",
    border: "1px solid var(--border)",
    borderRadius: "4px",
    cursor: "pointer",
    width: "100%",
    marginTop: "4px",
  },
  empty: {
    color: "var(--text-dim)",
    fontSize: "0.55rem",
    fontStyle: "italic" as const,
    padding: "12px 0",
    textAlign: "center" as const,
  },
  actionBadge: (action: string) => {
    const colors: Record<string, string> = {
      create: "var(--green)",
      modify: "var(--yellow)",
      delete: "var(--red)",
      rename: "var(--purple)",
      exec: "var(--accent)",
    };
    const c = colors[action] || "var(--text-muted)";
    return {
      display: "inline-block",
      padding: "1px 4px",
      borderRadius: "3px",
      fontSize: "0.5rem",
      fontWeight: 600,
      color: c,
      background: `color-mix(in srgb, ${c} 15%, transparent)`,
      border: `1px solid color-mix(in srgb, ${c} 30%, transparent)`,
      flexShrink: 0,
    };
  },
  path: {
    flex: 1,
    fontSize: "0.55rem",
    color: "var(--text-muted)",
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
    whiteSpace: "nowrap" as const,
    direction: "rtl" as const,
    textAlign: "left" as const,
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, { label: string; color: string }> = {
  commit: { label: "C", color: "var(--green)" },
  branch: { label: "B", color: "var(--purple)" },
  session: { label: "S", color: "var(--accent)" },
  clone: { label: "D", color: "var(--yellow)" },
  note: { label: "N", color: "var(--text-muted)" },
  status_change: { label: "~", color: "var(--yellow)" },
};

function relTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

// ── Component ───────────────────────────────────────────────────────────────

export function EventsPanel() {
  const [tab, setTab] = useState<"activity" | "audit">("activity");
  const [activities, setActivities] = useState<ActivityRecord[] | null>(null);
  const [audits, setAudits] = useState<AuditEvent[] | null>(null);
  const [actLimit, setActLimit] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const fetchActivity = useCallback(async (limit: number) => {
    try {
      const d = await apiGet<ActivityRecord[]>(`/api/pm/activity?limit=${limit}`);
      if (mounted.current) { setActivities(d); setError(null); }
    } catch (e) {
      if (mounted.current) setError(String(e));
    }
  }, []);

  const fetchAudit = useCallback(async () => {
    try {
      const d = await apiGet<AuditEvent[]>("/api/events/recent?limit=30");
      if (mounted.current) { setAudits(d); setError(null); }
    } catch (e) {
      if (mounted.current) setError(String(e));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (tab === "activity") fetchActivity(actLimit);
    else fetchAudit();

    const iv = setInterval(() => {
      if (tab === "activity") fetchActivity(actLimit);
      else fetchAudit();
    }, 10000);
    return () => clearInterval(iv);
  }, [tab, actLimit, fetchActivity, fetchAudit]);

  const loadMore = () => {
    const next = actLimit + 30;
    setActLimit(next);
    fetchActivity(next);
  };

  // ── Render ──

  return (
    <div style={S.panel}>
      <div style={S.tabBar}>
        <button style={S.tab(tab === "activity")} onClick={() => setTab("activity")}>
          Activity
        </button>
        <button style={S.tab(tab === "audit")} onClick={() => setTab("audit")}>
          Audit
        </button>
      </div>

      {error && (
        <div style={{ padding: "6px 8px", fontSize: "0.55rem", color: "var(--red)" }}>{error}</div>
      )}

      <div style={S.list}>
        {tab === "activity" && (
          <>
            {activities === null ? (
              <div style={S.empty}>Loading...</div>
            ) : activities.length === 0 ? (
              <div style={S.empty}>No activity recorded</div>
            ) : (
              <>
                {activities.map((a) => {
                  const icon = TYPE_ICONS[a.type] || { label: "?", color: "var(--text-dim)" };
                  return (
                    <div key={a.id} style={S.row}>
                      <span style={S.badge(icon.color)}>{icon.label}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={S.summary}>{a.summary}</div>
                        {(a.sessionName || a.projectId) && (
                          <div style={S.context}>
                            {a.sessionName || `project #${a.projectId}`}
                          </div>
                        )}
                      </div>
                      <span style={S.meta}>{relTime(a.createdAt)}</span>
                    </div>
                  );
                })}
                <button style={S.loadMore} onClick={loadMore}>Load more</button>
              </>
            )}
          </>
        )}

        {tab === "audit" && (
          <>
            {audits === null ? (
              <div style={S.empty}>Loading...</div>
            ) : audits.length === 0 ? (
              <div style={S.empty}>No audit events</div>
            ) : (
              audits.map((ev, i) => (
                <div key={`${ev.timestamp}-${i}`} style={S.row}>
                  <span style={S.actionBadge(ev.action)}>{ev.action}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.path}>{ev.path}</div>
                    {ev.agent && (
                      <div style={S.context}>{ev.agent}</div>
                    )}
                  </div>
                  <span style={S.meta}>{relTime(ev.timestamp)}</span>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
