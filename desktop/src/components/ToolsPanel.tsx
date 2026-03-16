import { useEffect, useState, useCallback, useRef } from "react";
import { apiGet, apiPost } from "../api/client";

// ── Types ───────────────────────────────────────────────────────────────────

type ToolStatus = Record<string, boolean>;

interface SystemStats {
  cpu: number | null;
  memUsed: number | null;
  memTotal: number | null;
  diskUsed: number | null;
  diskTotal: number | null;
}

interface EnvStatus {
  ANTHROPIC_API_KEY: boolean;
  OPENAI_API_KEY: boolean;
  GEMINI_API_KEY: boolean;
  GH_TOKEN: boolean;
}

type CassResult = unknown[] | { raw: string } | { error: string };
type CautResult = Record<string, unknown> | { raw: string } | { error: string };

// ── Styles ──────────────────────────────────────────────────────────────────

const S = {
  panel: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
    padding: "8px",
    height: "100%",
    overflowY: "auto" as const,
    fontSize: "0.65rem",
    color: "var(--text)",
  },
  sectionHeader: {
    fontSize: "0.5rem",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    color: "var(--text-muted)",
    marginBottom: "4px",
  },
  section: {
    background: "var(--bg-2)",
    borderRadius: "6px",
    border: "1px solid var(--border-subtle)",
    padding: "8px",
  },
  toolGrid: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "4px",
  },
  toolPill: (ok: boolean) => ({
    display: "inline-flex",
    alignItems: "center" as const,
    gap: "3px",
    padding: "2px 6px",
    borderRadius: "4px",
    fontSize: "0.55rem",
    background: ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
    border: `1px solid ${ok ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
    color: ok ? "var(--green)" : "var(--red)",
  }),
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "4px",
  },
  statCard: {
    background: "var(--bg-1)",
    borderRadius: "4px",
    padding: "6px",
    textAlign: "center" as const,
  },
  statValue: {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--text)",
  },
  statLabel: {
    fontSize: "0.5rem",
    color: "var(--text-dim)",
    marginTop: "1px",
  },
  envRow: {
    display: "flex",
    alignItems: "center" as const,
    gap: "6px",
    padding: "2px 0",
    fontSize: "0.6rem",
  },
  envIcon: (ok: boolean) => ({
    fontSize: "0.6rem",
    color: ok ? "var(--green)" : "var(--red)",
    width: "12px",
    textAlign: "center" as const,
    flexShrink: 0,
  }),
  envLabel: {
    color: "var(--text-muted)",
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
    whiteSpace: "nowrap" as const,
  },
  input: {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "4px 6px",
    fontSize: "0.6rem",
    background: "var(--bg-1)",
    border: "1px solid var(--border)",
    borderRadius: "4px",
    color: "var(--text)",
    outline: "none",
  },
  btn: {
    padding: "3px 8px",
    fontSize: "0.55rem",
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    flexShrink: 0,
  },
  scrollArea: {
    maxHeight: "120px",
    overflowY: "auto" as const,
    fontSize: "0.55rem",
    color: "var(--text-muted)",
    marginTop: "4px",
    background: "var(--bg-1)",
    borderRadius: "4px",
    padding: "4px",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-all" as const,
  },
  empty: {
    color: "var(--text-dim)",
    fontSize: "0.55rem",
    fontStyle: "italic" as const,
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function pct(used: number | null, total: number | null): string {
  if (used == null || total == null || total === 0) return "--";
  return `${Math.round((used / total) * 100)}%`;
}

function fmtGB(bytes: number | null): string {
  if (bytes == null) return "--";
  return `${(bytes / 1073741824).toFixed(1)}G`;
}

const ENV_LABELS: Record<string, string> = {
  ANTHROPIC_API_KEY: "Anthropic",
  OPENAI_API_KEY: "OpenAI",
  GEMINI_API_KEY: "Gemini",
  GH_TOKEN: "GitHub",
};

// ── Component ───────────────────────────────────────────────────────────────

export function ToolsPanel() {
  const [tools, setTools] = useState<ToolStatus | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [env, setEnv] = useState<EnvStatus | null>(null);
  const [cassQuery, setCassQuery] = useState("");
  const [cassResult, setCassResult] = useState<CassResult | null>(null);
  const [cassLoading, setCassLoading] = useState(false);
  const [caut, setCaut] = useState<CautResult | null>(null);
  const [cautLoading, setCautLoading] = useState(false);
  const mounted = useRef(true);

  // ── Load tools + env on mount ──

  useEffect(() => {
    mounted.current = true;
    apiGet<ToolStatus>("/api/tools/status").then((d) => { if (mounted.current) setTools(d); }).catch(() => {});
    apiGet<EnvStatus>("/api/tools/env").then((d) => { if (mounted.current) setEnv(d); }).catch(() => {});
    return () => { mounted.current = false; };
  }, []);

  // ── System stats polling ──

  const fetchStats = useCallback(async () => {
    try {
      const d = await apiGet<SystemStats>("/api/tools/system");
      if (mounted.current) setStats(d);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStats();
    const t = setInterval(fetchStats, 10000);
    return () => clearInterval(t);
  }, [fetchStats]);

  // ── CASS search ──

  const searchCass = async () => {
    const q = cassQuery.trim();
    if (!q) return;
    setCassLoading(true);
    try {
      const r = await apiPost<CassResult>("/api/tools/cass", { query: q });
      if (mounted.current) setCassResult(r);
    } catch (e) {
      if (mounted.current) setCassResult({ error: String(e) });
    }
    if (mounted.current) setCassLoading(false);
  };

  // ── CAUT fetch ──

  const fetchCaut = async () => {
    setCautLoading(true);
    try {
      const r = await apiGet<CautResult>("/api/tools/caut");
      if (mounted.current) setCaut(r);
    } catch (e) {
      if (mounted.current) setCaut({ error: String(e) });
    }
    if (mounted.current) setCautLoading(false);
  };

  // ── Render helpers ──

  const renderCassResult = () => {
    if (!cassResult) return null;
    if ("error" in cassResult) return <div style={{ color: "var(--red)" }}>{(cassResult as { error: string }).error}</div>;
    if ("raw" in cassResult) return <div>{(cassResult as { raw: string }).raw}</div>;
    if (Array.isArray(cassResult)) {
      if (cassResult.length === 0) return <div style={S.empty}>No results</div>;
      return cassResult.map((item, i) => (
        <div key={i} style={{ borderBottom: "1px solid var(--border-subtle)", paddingBottom: "3px", marginBottom: "3px" }}>
          {typeof item === "string" ? item : JSON.stringify(item, null, 1)}
        </div>
      ));
    }
    return <div>{JSON.stringify(cassResult, null, 1)}</div>;
  };

  const renderCaut = () => {
    if (!caut) return null;
    if ("error" in caut) return <div style={{ color: "var(--red)" }}>{(caut as { error: string }).error}</div>;
    if ("raw" in caut) return <div>{(caut as { raw: string }).raw}</div>;
    return <div>{JSON.stringify(caut, null, 2)}</div>;
  };

  // ── Render ──

  return (
    <div style={S.panel}>

      {/* Tool Inventory */}
      <div style={S.section}>
        <div style={S.sectionHeader}>Tool Inventory</div>
        {tools ? (
          <div style={S.toolGrid}>
            {Object.entries(tools).map(([name, ok]) => (
              <span key={name} style={S.toolPill(ok)}>
                {ok ? "\u2713" : "\u2717"} {name}
              </span>
            ))}
          </div>
        ) : (
          <div style={S.empty}>Loading...</div>
        )}
      </div>

      {/* System Stats */}
      <div style={S.section}>
        <div style={S.sectionHeader}>System Stats</div>
        {stats ? (
          <div style={S.statsGrid}>
            <div style={S.statCard}>
              <div style={S.statValue}>{stats.cpu != null ? `${Math.round(stats.cpu)}%` : "--"}</div>
              <div style={S.statLabel}>CPU</div>
            </div>
            <div style={S.statCard}>
              <div style={S.statValue}>{pct(stats.memUsed, stats.memTotal)}</div>
              <div style={S.statLabel}>Memory</div>
            </div>
            <div style={S.statCard}>
              <div style={S.statValue}>{fmtGB(stats.memUsed)}</div>
              <div style={S.statLabel}>Mem Used</div>
            </div>
            <div style={S.statCard}>
              <div style={S.statValue}>{pct(stats.diskUsed, stats.diskTotal)}</div>
              <div style={S.statLabel}>Disk</div>
            </div>
          </div>
        ) : (
          <div style={S.empty}>Loading...</div>
        )}
      </div>

      {/* Environment */}
      <div style={S.section}>
        <div style={S.sectionHeader}>Environment</div>
        {env ? (
          Object.entries(ENV_LABELS).map(([key, label]) => (
            <div key={key} style={S.envRow}>
              <span style={S.envIcon(env[key as keyof EnvStatus])}>
                {env[key as keyof EnvStatus] ? "\u2713" : "\u2717"}
              </span>
              <span style={S.envLabel}>{label}</span>
            </div>
          ))
        ) : (
          <div style={S.empty}>Loading...</div>
        )}
      </div>

      {/* CASS Search */}
      <div style={S.section}>
        <div style={S.sectionHeader}>CASS Search</div>
        <div style={{ display: "flex", gap: "4px" }}>
          <input
            style={S.input}
            value={cassQuery}
            onChange={(e) => setCassQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") searchCass(); }}
            placeholder="Search..."
          />
          <button style={S.btn} onClick={searchCass} disabled={cassLoading || !cassQuery.trim()}>
            {cassLoading ? "..." : "Go"}
          </button>
        </div>
        {cassResult && <div style={S.scrollArea}>{renderCassResult()}</div>}
      </div>

      {/* CAUT Usage */}
      <div style={S.section}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={S.sectionHeader}>CAUT Usage</div>
          <button style={{ ...S.btn, fontSize: "0.5rem", padding: "2px 6px" }} onClick={fetchCaut} disabled={cautLoading}>
            {cautLoading ? "..." : "Load"}
          </button>
        </div>
        {caut && <div style={S.scrollArea}>{renderCaut()}</div>}
      </div>
    </div>
  );
}
