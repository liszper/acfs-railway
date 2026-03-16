import { useEffect, useState, useRef, useCallback } from "react";
import { apiGet } from "../api/client";
import type { BeadsRecommendation, BeadsTriage } from "../api/types";

// ── Styles ──────────────────────────────────────────────────────────────────

const S = {
  panel: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "8px",
    padding: "8px",
    height: "100%",
    overflowY: "auto" as const,
    fontSize: "0.65rem",
    color: "var(--text)",
  },
  header: {
    display: "flex",
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  title: {
    fontSize: "0.6rem",
    fontWeight: 700,
    color: "var(--text)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  },
  refreshBtn: {
    padding: "2px 6px",
    fontSize: "0.5rem",
    background: "var(--bg-2)",
    color: "var(--text-muted)",
    border: "1px solid var(--border)",
    borderRadius: "4px",
    cursor: "pointer",
  },
  nextCard: {
    padding: "8px",
    background: "var(--bg-2)",
    borderRadius: "6px",
    borderLeft: "3px solid var(--accent)",
    border: "1px solid var(--border-subtle)",
    borderLeftColor: "var(--accent)",
    borderLeftWidth: "3px",
  },
  nextTitle: {
    fontSize: "0.65rem",
    fontWeight: 700,
    color: "var(--text)",
    marginBottom: "3px",
  },
  nextScore: {
    fontSize: "0.5rem",
    color: "var(--accent)",
    fontWeight: 600,
  },
  nextReason: {
    fontSize: "0.55rem",
    color: "var(--text-muted)",
    lineHeight: 1.3,
    marginTop: "3px",
  },
  section: {
    background: "var(--bg-2)",
    borderRadius: "6px",
    border: "1px solid var(--border-subtle)",
    overflow: "hidden" as const,
  },
  sectionToggle: {
    display: "flex",
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    width: "100%",
    padding: "6px 8px",
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    fontSize: "0.5rem",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    cursor: "pointer",
    textAlign: "left" as const,
  },
  sectionContent: {
    padding: "0 8px 6px 8px",
  },
  itemRow: {
    display: "flex",
    alignItems: "center" as const,
    gap: "5px",
    padding: "3px 0",
    borderBottom: "1px solid var(--border-subtle)",
  },
  itemTitle: {
    flex: 1,
    fontSize: "0.55rem",
    color: "var(--text)",
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
    whiteSpace: "nowrap" as const,
    minWidth: 0,
  },
  priorityBadge: (p: number | undefined) => {
    const colors: Record<number, string> = {
      0: "var(--red)",
      1: "var(--yellow)",
      2: "var(--accent)",
      3: "var(--text-muted)",
    };
    const c = colors[p ?? 3] || "var(--text-dim)";
    return {
      display: "inline-block",
      padding: "0 4px",
      borderRadius: "3px",
      fontSize: "0.45rem",
      fontWeight: 700,
      color: c,
      background: `color-mix(in srgb, ${c} 12%, transparent)`,
      flexShrink: 0,
    };
  },
  typeBadge: {
    display: "inline-block",
    padding: "0 4px",
    borderRadius: "3px",
    fontSize: "0.45rem",
    color: "var(--text-dim)",
    background: "var(--bg-1)",
    flexShrink: 0,
  },
  empty: {
    color: "var(--text-dim)",
    fontSize: "0.55rem",
    fontStyle: "italic" as const,
    textAlign: "center" as const,
    padding: "12px 0",
  },
  unavailable: {
    color: "var(--text-dim)",
    fontSize: "0.55rem",
    fontStyle: "italic" as const,
    textAlign: "center" as const,
    padding: "20px 8px",
    lineHeight: 1.4,
  },
  healthGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "4px",
    fontSize: "0.5rem",
  },
  healthCell: {
    padding: "4px 6px",
    background: "var(--bg-1)",
    borderRadius: "4px",
  },
  healthLabel: {
    color: "var(--text-dim)",
    fontSize: "0.45rem",
  },
  healthValue: {
    color: "var(--text)",
    fontWeight: 600,
    fontSize: "0.55rem",
  },
};

// ── Component ───────────────────────────────────────────────────────────────

export function BeadsPanel() {
  const [triage, setTriage] = useState<BeadsTriage | null>(null);
  const [ready, setReady] = useState<BeadsRecommendation[] | null>(null);
  const [next, setNext] = useState<BeadsRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openReady, setOpenReady] = useState(true);
  const [openQuickWins, setOpenQuickWins] = useState(true);
  const [openBlockers, setOpenBlockers] = useState(true);
  const [openHealth, setOpenHealth] = useState(false);

  const mounted = useRef(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const [triageRes, readyRes, nextRes] = await Promise.allSettled([
        apiGet<BeadsTriage>("/api/beads/triage"),
        apiGet<BeadsRecommendation[] | { error: string }>("/api/beads/ready"),
        apiGet<BeadsRecommendation | { error: string }>("/api/beads/next"),
      ]);

      if (!mounted.current) return;

      // Check if beads is available
      let anyError = false;

      if (triageRes.status === "fulfilled") {
        const t = triageRes.value;
        if (t && typeof t === "object" && "error" in t && typeof t.error === "string" &&
            (t.error.includes("not found") || t.error.includes("not available") || t.error.includes("not installed"))) {
          setUnavailable(true);
          setLoading(false);
          return;
        }
        setTriage(t);
      } else {
        anyError = true;
      }

      if (readyRes.status === "fulfilled") {
        const r = readyRes.value;
        if (Array.isArray(r)) setReady(r);
        else if (r && "error" in r) anyError = true;
      }

      if (nextRes.status === "fulfilled") {
        const n = nextRes.value;
        if (n && typeof n === "object" && !("error" in n)) {
          setNext(n as BeadsRecommendation);
        }
      }

      if (anyError && !triage && !ready && !next) {
        // All failed — likely unavailable
        setUnavailable(true);
      }
    } catch (e) {
      if (mounted.current) {
        const msg = String(e);
        if (msg.includes("not found") || msg.includes("not available")) {
          setUnavailable(true);
        } else {
          setError(msg);
        }
      }
    }
    if (mounted.current) setLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchAll();
    return () => { mounted.current = false; };
  }, [fetchAll]);

  // ── Render helpers ──

  const renderItem = (item: BeadsRecommendation, i: number) => (
    <div key={item.id ?? i} style={S.itemRow}>
      <span style={S.priorityBadge(item.priority)}>P{item.priority ?? "?"}</span>
      {item.type && <span style={S.typeBadge}>{item.type}</span>}
      <span style={S.itemTitle} title={item.title}>{item.title}</span>
    </div>
  );

  const renderCollapsible = (
    label: string,
    isOpen: boolean,
    toggle: () => void,
    items: BeadsRecommendation[] | undefined,
  ) => {
    if (!items || items.length === 0) return null;
    return (
      <div style={S.section}>
        <button style={S.sectionToggle} onClick={toggle}>
          <span>{label} ({items.length})</span>
          <span>{isOpen ? "\u25B4" : "\u25BE"}</span>
        </button>
        {isOpen && (
          <div style={S.sectionContent}>
            {items.map(renderItem)}
          </div>
        )}
      </div>
    );
  };

  // ── Render ──

  if (unavailable) {
    return (
      <div style={S.panel}>
        <div style={S.header}>
          <span style={S.title}>What to Work On</span>
        </div>
        <div style={S.unavailable}>
          Beads/BV not available.<br />
          Install bv/br tools to enable work item triage and recommendations.
        </div>
      </div>
    );
  }

  return (
    <div style={S.panel}>
      <div style={S.header}>
        <span style={S.title}>What to Work On</span>
        <button style={S.refreshBtn} onClick={fetchAll} disabled={loading}>
          {loading ? "..." : "\u21BB"}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: "0.55rem", color: "var(--red)" }}>{error}</div>
      )}

      {loading && !next && !triage ? (
        <div style={S.empty}>Loading...</div>
      ) : (
        <>
          {/* Next action card */}
          {next && (
            <div style={S.nextCard}>
              <div style={S.nextTitle}>{next.title}</div>
              {next.score != null && (
                <span style={S.nextScore}>Score: {next.score}</span>
              )}
              {next.reason && (
                <div style={S.nextReason}>{next.reason}</div>
              )}
            </div>
          )}

          {/* Ready items */}
          {renderCollapsible(
            "Ready",
            openReady,
            () => setOpenReady((v) => !v),
            ready ?? undefined,
          )}

          {/* Quick wins */}
          {renderCollapsible(
            "Quick Wins",
            openQuickWins,
            () => setOpenQuickWins((v) => !v),
            triage?.quick_wins,
          )}

          {/* Blockers */}
          {renderCollapsible(
            "Blockers to Clear",
            openBlockers,
            () => setOpenBlockers((v) => !v),
            triage?.blockers_to_clear,
          )}

          {/* Project health */}
          {triage?.project_health && Object.keys(triage.project_health).length > 0 && (
            <div style={S.section}>
              <button
                style={S.sectionToggle}
                onClick={() => setOpenHealth((v) => !v)}
              >
                <span>Project Health</span>
                <span>{openHealth ? "\u25B4" : "\u25BE"}</span>
              </button>
              {openHealth && (
                <div style={S.sectionContent}>
                  <div style={S.healthGrid}>
                    {Object.entries(triage.project_health).map(([k, v]) => (
                      <div key={k} style={S.healthCell}>
                        <div style={S.healthLabel}>{k.replace(/_/g, " ")}</div>
                        <div style={S.healthValue}>{String(v)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Nothing at all */}
          {!next && (!ready || ready.length === 0) && !triage?.quick_wins?.length && !triage?.blockers_to_clear?.length && (
            <div style={S.empty}>No recommendations available</div>
          )}
        </>
      )}
    </div>
  );
}
