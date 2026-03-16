import { useEffect, useState, useRef, useCallback } from "react";
import { apiGet } from "../api/client";
import type { AgentProcess } from "../api/types";

// ── Types ───────────────────────────────────────────────────────────────────

interface AgentStats {
  total: number;
  byType: Record<string, number>;
}

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
  summaryBar: {
    display: "flex",
    alignItems: "center" as const,
    gap: "6px",
    flexWrap: "wrap" as const,
    padding: "6px 8px",
    background: "var(--bg-2)",
    borderRadius: "6px",
    border: "1px solid var(--border-subtle)",
  },
  totalCount: {
    fontSize: "0.7rem",
    fontWeight: 700,
    color: "var(--text)",
    marginRight: "4px",
  },
  typeBadge: (color: string) => ({
    display: "inline-flex",
    alignItems: "center" as const,
    gap: "3px",
    padding: "1px 5px",
    borderRadius: "3px",
    fontSize: "0.5rem",
    fontWeight: 600,
    color,
    background: `color-mix(in srgb, ${color} 12%, transparent)`,
    border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
  }),
  agentRow: {
    display: "flex",
    alignItems: "center" as const,
    gap: "6px",
    padding: "5px 8px",
    background: "var(--bg-2)",
    borderRadius: "5px",
    border: "1px solid var(--border-subtle)",
  },
  dot: (color: string) => ({
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: color,
    flexShrink: 0,
  }),
  agentName: {
    fontSize: "0.6rem",
    fontWeight: 600,
    color: "var(--text)",
    minWidth: "42px",
  },
  session: {
    flex: 1,
    fontSize: "0.55rem",
    color: "var(--text-muted)",
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
    whiteSpace: "nowrap" as const,
    minWidth: 0,
  },
  metrics: {
    display: "flex",
    gap: "6px",
    fontSize: "0.5rem",
    color: "var(--text-dim)",
    flexShrink: 0,
  },
  elapsed: {
    fontSize: "0.5rem",
    color: "var(--text-dim)",
    flexShrink: 0,
  },
  empty: {
    color: "var(--text-dim)",
    fontSize: "0.55rem",
    fontStyle: "italic" as const,
    textAlign: "center" as const,
    padding: "20px 0",
  },
  sectionHeader: {
    fontSize: "0.5rem",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    color: "var(--text-muted)",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const AGENT_COLORS: Record<string, string> = {
  claude: "#bc8cff",
  codex: "#3fb950",
  gemini: "#58a6ff",
  opencode: "var(--yellow)",
};

function agentColor(name: string): string {
  const key = name.toLowerCase();
  for (const [k, v] of Object.entries(AGENT_COLORS)) {
    if (key.includes(k)) return v;
  }
  return "var(--text-muted)";
}

function shortName(agent: string): string {
  const lower = agent.toLowerCase();
  if (lower.includes("claude")) return "Claude";
  if (lower.includes("codex")) return "Codex";
  if (lower.includes("gemini")) return "Gemini";
  if (lower.includes("opencode")) return "OCode";
  return agent.slice(0, 6);
}

// ── Component ───────────────────────────────────────────────────────────────

export function AgentMonitorPanel() {
  const [processes, setProcesses] = useState<AgentProcess[] | null>(null);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const fetchData = useCallback(async () => {
    try {
      const [procs, st] = await Promise.all([
        apiGet<AgentProcess[]>("/api/agents/processes"),
        apiGet<AgentStats>("/api/agents/stats"),
      ]);
      if (mounted.current) {
        setProcesses(procs.sort((a, b) => b.cpu - a.cpu));
        setStats(st);
        setError(null);
      }
    } catch (e) {
      if (mounted.current) setError(String(e));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchData();
    const iv = setInterval(fetchData, 5000);
    return () => { mounted.current = false; clearInterval(iv); };
  }, [fetchData]);

  return (
    <div style={S.panel}>
      <div style={S.sectionHeader}>Agent Processes</div>

      {error && (
        <div style={{ fontSize: "0.55rem", color: "var(--red)" }}>{error}</div>
      )}

      {/* Summary bar */}
      {stats && (
        <div style={S.summaryBar}>
          <span style={S.totalCount}>{stats.total}</span>
          <span style={{ fontSize: "0.5rem", color: "var(--text-dim)" }}>agents</span>
          <span style={{ flex: 1 }} />
          {Object.entries(stats.byType).map(([type, count]) => (
            <span key={type} style={S.typeBadge(agentColor(type))}>
              {count} {type}
            </span>
          ))}
        </div>
      )}

      {/* Agent list */}
      {processes === null ? (
        <div style={S.empty}>Loading...</div>
      ) : processes.length === 0 ? (
        <div style={S.empty}>No agents running</div>
      ) : (
        processes.map((p) => {
          const color = agentColor(p.agent);
          return (
            <div key={p.pid} style={S.agentRow}>
              <span style={S.dot(color)} />
              <span style={S.agentName}>{shortName(p.agent)}</span>
              <span style={S.session}>{p.session || "\u2014"}</span>
              <span style={S.metrics}>
                <span>{p.cpu.toFixed(0)}%</span>
                <span>{p.mem.toFixed(0)}M</span>
              </span>
              <span style={S.elapsed}>{p.elapsed}</span>
            </div>
          );
        })
      )}
    </div>
  );
}
