import { useEffect, useState, useCallback } from "react";
import { apiGet, apiPost } from "../api/client";
import type { SessionInfo, ProjectRecord } from "../api/types";

type Tab = "recipes" | "custom" | "running";

const RECIPES = [
  { id: "minimal", name: "Single Agent", desc: "One Claude for focused work", agents: "1C", cc: 1, cod: 0, gmi: 0 },
  { id: "quick-claude", name: "Quick Start", desc: "Two Claude agents", agents: "2C", cc: 2, cod: 0, gmi: 0 },
  { id: "full-stack", name: "Full Stack", desc: "Multi-model coverage", agents: "3C 2X 1G", cc: 3, cod: 2, gmi: 1 },
  { id: "balanced", name: "Balanced", desc: "Equal representation", agents: "2C 2X 2G", cc: 2, cod: 2, gmi: 2 },
  { id: "codex-heavy", name: "Codex Focus", desc: "Codex-led with Claude oversight", agents: "1C 4X", cc: 1, cod: 4, gmi: 0 },
  { id: "review-team", name: "Code Review", desc: "Reviewers + implementer", agents: "2C 1X", cc: 2, cod: 1, gmi: 0 },
] as const;

const AC = { claude: "#bc8cff", codex: "#3fb950", gemini: "#58a6ff" };

const s = {
  panel: {
    height: "100%",
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
    background: "var(--bg-1)",
    color: "var(--text)",
    fontSize: "0.6rem",
  },
  pillBar: {
    display: "flex",
    gap: "2px",
    padding: "6px 6px 4px",
    background: "var(--bg-0)",
    borderBottom: "1px solid var(--border-subtle)",
  },
  pill: (active: boolean) => ({
    flex: 1,
    padding: "3px 0",
    fontSize: "0.5rem",
    fontWeight: 600,
    textAlign: "center" as const,
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    background: active ? "var(--bg-3)" : "transparent",
    color: active ? "var(--text)" : "var(--text-muted)",
    transition: "all 0.15s",
  }),
  body: {
    flex: 1,
    overflow: "auto",
    padding: "6px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "4px",
  },
  card: (selected: boolean) => ({
    padding: "6px 8px",
    background: selected ? "var(--bg-3)" : "var(--bg-2)",
    border: `1px solid ${selected ? "var(--accent)" : "var(--border-subtle)"}`,
    borderRadius: "5px",
    cursor: "pointer",
    transition: "all 0.15s",
  }),
  cardName: {
    fontSize: "0.55rem",
    fontWeight: 600,
    color: "var(--text)",
    marginBottom: "2px",
  },
  cardDesc: {
    fontSize: "0.5rem",
    color: "var(--text-muted)",
    marginBottom: "4px",
  },
  badges: {
    display: "flex",
    gap: "3px",
    flexWrap: "wrap" as const,
  },
  badge: (color: string) => ({
    display: "inline-block",
    padding: "1px 4px",
    borderRadius: "3px",
    fontSize: "0.5rem",
    fontWeight: 700,
    background: color + "22",
    color,
    lineHeight: 1.4,
  }),
  input: {
    width: "100%",
    padding: "4px 6px",
    fontSize: "0.55rem",
    background: "var(--bg-0)",
    border: "1px solid var(--border)",
    borderRadius: "4px",
    color: "var(--text)",
    outline: "none",
    boxSizing: "border-box" as const,
  },
  select: {
    width: "100%",
    padding: "4px 6px",
    fontSize: "0.55rem",
    background: "var(--bg-0)",
    border: "1px solid var(--border)",
    borderRadius: "4px",
    color: "var(--text)",
    outline: "none",
    boxSizing: "border-box" as const,
  },
  textarea: {
    width: "100%",
    padding: "4px 6px",
    fontSize: "0.55rem",
    background: "var(--bg-0)",
    border: "1px solid var(--border)",
    borderRadius: "4px",
    color: "var(--text)",
    outline: "none",
    resize: "vertical" as const,
    minHeight: "40px",
    fontFamily: "inherit",
    boxSizing: "border-box" as const,
  },
  btn: (disabled: boolean) => ({
    width: "100%",
    padding: "5px 0",
    fontSize: "0.55rem",
    fontWeight: 600,
    border: "none",
    borderRadius: "4px",
    cursor: disabled ? "not-allowed" : "pointer",
    background: disabled ? "var(--bg-3)" : "var(--accent)",
    color: disabled ? "var(--text-dim)" : "#fff",
    transition: "all 0.15s",
  }),
  label: {
    fontSize: "0.5rem",
    fontWeight: 600,
    color: "var(--text-muted)",
    marginBottom: "2px",
  },
  fieldGroup: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "2px",
  },
  spawnForm: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "6px",
    padding: "6px 0 2px",
  },
  slider: {
    width: "100%",
    accentColor: "var(--accent)",
    height: "4px",
  },
  sliderRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  sliderLabel: (color: string) => ({
    fontSize: "0.5rem",
    fontWeight: 700,
    color,
    width: "14px",
    flexShrink: 0,
  }),
  sliderVal: {
    fontSize: "0.5rem",
    fontWeight: 700,
    color: "var(--text)",
    width: "10px",
    textAlign: "right" as const,
    flexShrink: 0,
  },
  feedback: (ok: boolean) => ({
    fontSize: "0.5rem",
    padding: "4px 6px",
    borderRadius: "4px",
    background: ok ? "#22c55e18" : "#ef444418",
    color: ok ? "var(--green)" : "var(--red)",
    textAlign: "center" as const,
  }),
  sessionRow: {
    padding: "5px 8px",
    background: "var(--bg-2)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "5px",
    cursor: "pointer",
  },
  sessionTop: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  sessionName: {
    fontSize: "0.55rem",
    fontWeight: 600,
    color: "var(--text)",
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  paneTag: {
    fontSize: "0.45rem",
    padding: "1px 3px",
    borderRadius: "3px",
    background: "var(--bg-3)",
    color: "var(--text-muted)",
  },
  expandedCtrl: {
    marginTop: "6px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "4px",
    borderTop: "1px solid var(--border-subtle)",
    paddingTop: "6px",
  },
  targetRow: {
    display: "flex",
    gap: "3px",
  },
  targetBtn: (active: boolean) => ({
    flex: 1,
    padding: "2px 0",
    fontSize: "0.45rem",
    fontWeight: 600,
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    borderRadius: "3px",
    background: active ? "var(--accent)" + "22" : "transparent",
    color: active ? "var(--accent)" : "var(--text-muted)",
    cursor: "pointer",
  }),
  interruptBtn: {
    padding: "4px 0",
    fontSize: "0.5rem",
    fontWeight: 600,
    border: "1px solid var(--red)",
    borderRadius: "4px",
    background: "transparent",
    color: "var(--red)",
    cursor: "pointer",
    width: "100%",
  },
  statusBox: {
    fontSize: "0.45rem",
    padding: "4px 6px",
    background: "var(--bg-0)",
    borderRadius: "4px",
    color: "var(--text-muted)",
    maxHeight: "60px",
    overflow: "auto",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-all" as const,
  },
  sendRow: {
    display: "flex",
    gap: "3px",
  },
  sendBtn: {
    padding: "4px 8px",
    fontSize: "0.5rem",
    fontWeight: 600,
    border: "none",
    borderRadius: "4px",
    background: "var(--accent)",
    color: "#fff",
    cursor: "pointer",
    flexShrink: 0,
  },
};

function agentBadges(agents: string) {
  const parts = agents.split(" ");
  return (
    <span style={s.badges}>
      {parts.map((p) => {
        const color = p.includes("C") ? AC.claude : p.includes("X") ? AC.codex : AC.gemini;
        return <span key={p} style={s.badge(color)}>{p}</span>;
      })}
    </span>
  );
}

function ts() {
  return Math.floor(Date.now() / 1000).toString(36);
}

export function NtmPanel() {
  const [tab, setTab] = useState<Tab>("recipes");
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    apiGet<ProjectRecord[]>("/api/pm/projects?status=active").then(setProjects).catch(() => {});
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  return (
    <div style={s.panel}>
      <div style={s.pillBar}>
        {(["recipes", "custom", "running"] as Tab[]).map((t) => (
          <button key={t} style={s.pill(tab === t)} onClick={() => setTab(t)}>
            {t === "recipes" ? "Recipes" : t === "custom" ? "Custom" : "Running"}
          </button>
        ))}
      </div>
      <div style={s.body}>
        {feedback && <div style={s.feedback(feedback.ok)}>{feedback.msg}</div>}
        {tab === "recipes" && <RecipesTab projects={projects} onFeedback={setFeedback} />}
        {tab === "custom" && <CustomTab projects={projects} onFeedback={setFeedback} />}
        {tab === "running" && <RunningTab />}
      </div>
    </div>
  );
}

/* ── Recipes Tab ──────────────────────────────────────────────────────────── */

function RecipesTab({ projects, onFeedback }: {
  projects: ProjectRecord[];
  onFeedback: (f: { ok: boolean; msg: string }) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);

  const selectRecipe = (id: string) => {
    if (selected === id) { setSelected(null); return; }
    setSelected(id);
    setName(`ntm-${id}-${ts()}`);
  };

  const spawn = async () => {
    if (!selected || !name.trim() || busy) return;
    setBusy(true);
    try {
      const res = await apiPost<{ ok: boolean; name?: string; url?: string; error?: string }>("/api/ntm/spawn", {
        name: name.trim(),
        recipe: selected,
        ...(projectId ? { projectPath: projects.find((p) => p.id === projectId)?.path } : {}),
      });
      if (res.ok) {
        onFeedback({ ok: true, msg: `Spawned "${res.name || name.trim()}"` });
        setSelected(null);
        setName("");
      } else {
        onFeedback({ ok: false, msg: res.error || "Spawn failed" });
      }
    } catch (e: any) {
      onFeedback({ ok: false, msg: e?.message || "Spawn failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {RECIPES.map((r) => (
        <div key={r.id} style={s.card(selected === r.id)} onClick={() => selectRecipe(r.id)}>
          <div style={s.cardName}>{r.name}</div>
          <div style={s.cardDesc}>{r.desc}</div>
          {agentBadges(r.agents)}
          {selected === r.id && (
            <div style={s.spawnForm} onClick={(e) => e.stopPropagation()}>
              <div style={s.fieldGroup}>
                <span style={s.label}>Session Name</span>
                <input style={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="ntm-session" />
              </div>
              <div style={s.fieldGroup}>
                <span style={s.label}>Project</span>
                <select style={s.select} value={projectId} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">None</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <button style={s.btn(busy || !name.trim())} disabled={busy || !name.trim()} onClick={spawn}>
                {busy ? "Spawning..." : "Spawn"}
              </button>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

/* ── Custom Tab ───────────────────────────────────────────────────────────── */

function CustomTab({ projects, onFeedback }: {
  projects: ProjectRecord[];
  onFeedback: (f: { ok: boolean; msg: string }) => void;
}) {
  const [cc, setCc] = useState(1);
  const [cod, setCod] = useState(0);
  const [gmi, setGmi] = useState(0);
  const [name, setName] = useState(() => `ntm-custom-${ts()}`);
  const [projectId, setProjectId] = useState<number | "">("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  const total = cc + cod + gmi;

  const spawn = async () => {
    if (!name.trim() || total === 0 || busy) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { name: name.trim(), cc, cod, gmi };
      if (prompt.trim()) body.prompt = prompt.trim();
      if (projectId) body.projectPath = projects.find((p) => p.id === projectId)?.path;
      const res = await apiPost<{ ok: boolean; name?: string; error?: string }>("/api/ntm/spawn", body);
      if (res.ok) {
        onFeedback({ ok: true, msg: `Spawned "${res.name || name.trim()}"` });
        setName(`ntm-custom-${ts()}`);
        setPrompt("");
      } else {
        onFeedback({ ok: false, msg: res.error || "Spawn failed" });
      }
    } catch (e: any) {
      onFeedback({ ok: false, msg: e?.message || "Spawn failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div style={s.fieldGroup}>
        <div style={s.sliderRow}>
          <span style={s.sliderLabel(AC.claude)}>C</span>
          <input type="range" min={0} max={5} value={cc} onChange={(e) => setCc(+e.target.value)} style={{ ...s.slider, accentColor: AC.claude, flex: 1 }} />
          <span style={s.sliderVal}>{cc}</span>
        </div>
        <div style={s.sliderRow}>
          <span style={s.sliderLabel(AC.codex)}>X</span>
          <input type="range" min={0} max={5} value={cod} onChange={(e) => setCod(+e.target.value)} style={{ ...s.slider, accentColor: AC.codex, flex: 1 }} />
          <span style={s.sliderVal}>{cod}</span>
        </div>
        <div style={s.sliderRow}>
          <span style={s.sliderLabel(AC.gemini)}>G</span>
          <input type="range" min={0} max={5} value={gmi} onChange={(e) => setGmi(+e.target.value)} style={{ ...s.slider, accentColor: AC.gemini, flex: 1 }} />
          <span style={s.sliderVal}>{gmi}</span>
        </div>
      </div>
      <div style={{ ...s.badges, justifyContent: "center", padding: "2px 0" }}>
        {cc > 0 && <span style={s.badge(AC.claude)}>{cc}C</span>}
        {cod > 0 && <span style={s.badge(AC.codex)}>{cod}X</span>}
        {gmi > 0 && <span style={s.badge(AC.gemini)}>{gmi}G</span>}
        {total === 0 && <span style={{ fontSize: "0.5rem", color: "var(--text-dim)" }}>Select at least one agent</span>}
      </div>
      <div style={s.fieldGroup}>
        <span style={s.label}>Session Name</span>
        <input style={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="ntm-custom" />
      </div>
      <div style={s.fieldGroup}>
        <span style={s.label}>Project</span>
        <select style={s.select} value={projectId} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">None</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div style={s.fieldGroup}>
        <span style={s.label}>Prompt (optional)</span>
        <textarea style={s.textarea} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Instructions for the agents..." rows={3} />
      </div>
      <button style={s.btn(busy || !name.trim() || total === 0)} disabled={busy || !name.trim() || total === 0} onClick={spawn}>
        {busy ? "Spawning..." : "Spawn Team"}
      </button>
    </>
  );
}

/* ── Running Tab ──────────────────────────────────────────────────────────── */

function RunningTab() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const all = await apiGet<SessionInfo[]>("/api/sessions");
      setSessions(all.filter((s) => s.isNtmSession));
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  if (sessions.length === 0) {
    return <div style={{ fontSize: "0.5rem", color: "var(--text-dim)", textAlign: "center", padding: "16px 0" }}>No NTM sessions running</div>;
  }

  return (
    <>
      {sessions.map((ses) => (
        <NtmSessionRow key={ses.name} session={ses} expanded={expanded === ses.name} onToggle={() => setExpanded(expanded === ses.name ? null : ses.name)} />
      ))}
    </>
  );
}

function NtmSessionRow({ session, expanded, onToggle }: {
  session: SessionInfo;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [target, setTarget] = useState<string>("all");
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded) return;
    const fetchStatus = async () => {
      try {
        const res = await apiGet<Record<string, unknown>>(`/api/ntm/status/${session.name}`);
        if (!("error" in res)) setStatus(res);
      } catch {}
    };
    fetchStatus();
    const t = setInterval(fetchStatus, 5000);
    return () => clearInterval(t);
  }, [expanded, session.name]);

  const send = async () => {
    if (!prompt.trim() || sending) return;
    setSending(true);
    try {
      const body: Record<string, unknown> = { session: session.name, prompt: prompt.trim() };
      if (target !== "all") body.target = target;
      await apiPost("/api/ntm/send", body);
      setPrompt("");
      setFeedback("Sent");
    } catch {
      setFeedback("Send failed");
    } finally {
      setSending(false);
      setTimeout(() => setFeedback(null), 2000);
    }
  };

  const interrupt = async () => {
    try {
      await apiPost("/api/ntm/interrupt", { session: session.name });
      setFeedback("Interrupted");
    } catch {
      setFeedback("Interrupt failed");
    }
    setTimeout(() => setFeedback(null), 2000);
  };

  const { claude, codex, gemini } = session.agentCounts;

  return (
    <div style={s.sessionRow}>
      <div style={s.sessionTop} onClick={onToggle}>
        <span style={{ fontSize: "0.45rem", color: "var(--text-dim)" }}>{expanded ? "▾" : "▸"}</span>
        <span style={s.sessionName}>{session.name}</span>
        <span style={s.badges}>
          {claude > 0 && <span style={s.badge(AC.claude)}>C{claude > 1 ? claude : ""}</span>}
          {codex > 0 && <span style={s.badge(AC.codex)}>X{codex > 1 ? codex : ""}</span>}
          {gemini > 0 && <span style={s.badge(AC.gemini)}>G{gemini > 1 ? gemini : ""}</span>}
        </span>
        <span style={s.paneTag}>{session.paneCount}P</span>
      </div>
      {expanded && (
        <div style={s.expandedCtrl}>
          {feedback && <div style={{ fontSize: "0.45rem", color: feedback.includes("fail") ? "var(--red)" : "var(--green)", textAlign: "center" }}>{feedback}</div>}
          <div style={s.sendRow}>
            <textarea
              style={{ ...s.textarea, flex: 1, minHeight: "28px" }}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Send prompt..."
              rows={2}
            />
            <button style={s.sendBtn} onClick={send} disabled={!prompt.trim() || sending}>
              {sending ? "..." : "Send"}
            </button>
          </div>
          <div style={s.targetRow}>
            {["all", "claude", "codex", "gemini"].map((t) => (
              <button key={t} style={s.targetBtn(target === t)} onClick={() => setTarget(t)}>
                {t === "all" ? "All" : t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <button style={s.interruptBtn} onClick={interrupt}>Interrupt</button>
          {status && (
            <div style={s.statusBox}>{JSON.stringify(status, null, 1)}</div>
          )}
        </div>
      )}
    </div>
  );
}
