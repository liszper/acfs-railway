import { useEffect, useState, useCallback } from "react";
import { apiGet, apiPost } from "../api/client";

interface SecretsStatus {
  aiKeys: { anthropic: boolean; openai: boolean; gemini: boolean };
  github: { token: boolean; sshKey: boolean; gitName: string; gitEmail: string };
  cloudCLIs: {
    railway: { configured: boolean; authenticated: boolean; user?: string };
    vercel: { configured: boolean; authenticated: boolean; user?: string };
    supabase: { configured: boolean; authenticated: boolean; user?: string };
    cloudflare: { configured: boolean; authenticated: boolean; user?: string };
    vault: { configured: boolean };
  };
  ssh: { hasPrivateKey: boolean; hasPublicKey: boolean; source: string; publicKey?: string; fingerprint?: string };
  container: { user: string; hostname: string };
  terminal: { user: string; passwordDefault: boolean };
  dotfiles: { repo?: string };
  webhooks: { url: boolean; secret: boolean };
  agentLimits: { memLimit?: string; nproc?: string };
  opencode: Record<string, string>;
  cliAuthCacheAge: number | null;
}

// ── Styles ──────────────────────────────────────────────────────────────────

const S = {
  panel: {
    padding: "8px 10px",
    overflowY: "auto" as const,
    height: "100%",
    fontSize: "0.65rem",
    color: "var(--text)",
  },
  section: {
    marginBottom: 12,
  },
  sectionHeader: {
    fontSize: "0.5rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
    marginBottom: 4,
    fontWeight: 600,
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "3px 0",
    gap: 4,
  },
  label: {
    color: "var(--text-dim)",
    flexShrink: 0,
  },
  pill: (set: boolean) => ({
    display: "inline-block",
    padding: "1px 6px",
    borderRadius: 8,
    fontSize: "0.5rem",
    fontWeight: 600,
    background: set ? "rgba(34,197,94,0.15)" : "rgba(113,113,122,0.15)",
    color: set ? "var(--green)" : "var(--text-dim)",
    whiteSpace: "nowrap" as const,
  }),
  cliCard: (ok: boolean) => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "4px 6px",
    marginBottom: 3,
    borderRadius: 4,
    background: "var(--bg-2)",
    border: "1px solid var(--border-subtle)",
    borderLeft: `2px solid ${ok ? "var(--green)" : "var(--text-dim)"}`,
  }),
  input: {
    width: "100%",
    padding: "3px 6px",
    fontSize: "0.65rem",
    background: "var(--bg-2)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 4,
    color: "var(--text)",
    outline: "none",
  },
  textarea: {
    width: "100%",
    padding: "4px 6px",
    fontSize: "0.55rem",
    fontFamily: "monospace",
    background: "var(--bg-2)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 4,
    color: "var(--text)",
    resize: "none" as const,
    outline: "none",
  },
  btn: {
    padding: "2px 8px",
    fontSize: "0.55rem",
    fontWeight: 600,
    border: "1px solid var(--border)",
    borderRadius: 4,
    background: "var(--bg-3)",
    color: "var(--text)",
    cursor: "pointer",
  },
  btnAccent: {
    padding: "2px 8px",
    fontSize: "0.55rem",
    fontWeight: 600,
    border: "1px solid var(--accent)",
    borderRadius: 4,
    background: "rgba(59,130,246,0.15)",
    color: "var(--accent)",
    cursor: "pointer",
  },
  value: {
    color: "var(--text)",
    fontFamily: "monospace",
    fontSize: "0.55rem",
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
    whiteSpace: "nowrap" as const,
  },
  feedback: (type: "ok" | "err" | "") => ({
    padding: type ? "4px 8px" : 0,
    margin: type ? "4px 0" : 0,
    fontSize: "0.55rem",
    borderRadius: 4,
    background: type === "ok" ? "rgba(34,197,94,0.12)" : type === "err" ? "rgba(239,68,68,0.12)" : "transparent",
    color: type === "ok" ? "var(--green)" : type === "err" ? "var(--red)" : "transparent",
    height: type ? "auto" : 0,
    overflow: "hidden" as const,
    transition: "all 0.15s",
  }),
  mono: {
    fontFamily: "monospace",
    fontSize: "0.55rem",
    color: "var(--text-dim)",
  },
};

// ── Component ───────────────────────────────────────────────────────────────

export function SecretsPanel() {
  const [data, setData] = useState<SecretsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [gitName, setGitName] = useState("");
  const [gitEmail, setGitEmail] = useState("");
  const [gitDirty, setGitDirty] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; type: "ok" | "err" }>({ msg: "", type: "ok" });
  const [busy, setBusy] = useState("");

  const toast = (msg: string, type: "ok" | "err" = "ok") => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback({ msg: "", type: "ok" }), 3000);
  };

  const refresh = useCallback(async () => {
    try {
      const s = await apiGet<SecretsStatus>("/api/secrets/status");
      setData(s);
      setGitName((prev) => prev || s.github.gitName);
      setGitEmail((prev) => prev || s.github.gitEmail);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh]);

  // ── Actions ──

  const saveGit = async () => {
    setBusy("git");
    try {
      await apiPost("/api/secrets/git", { name: gitName, email: gitEmail });
      toast("Git config saved");
      setGitDirty(false);
      refresh();
    } catch (e) {
      toast(String(e), "err");
    } finally {
      setBusy("");
    }
  };

  const generateSSH = async (force = false) => {
    setBusy("ssh-gen");
    try {
      await apiPost("/api/secrets/ssh/generate", { force });
      toast(force ? "SSH key regenerated" : "SSH key generated");
      refresh();
    } catch (e) {
      toast(String(e), "err");
    } finally {
      setBusy("");
    }
  };

  const uploadSSHToGH = async () => {
    setBusy("ssh-gh");
    try {
      await apiPost("/api/secrets/ssh/github", {});
      toast("Public key uploaded to GitHub");
      refresh();
    } catch (e) {
      toast(String(e), "err");
    } finally {
      setBusy("");
    }
  };

  const copyPubKey = () => {
    if (data?.ssh.publicKey) {
      navigator.clipboard.writeText(data.ssh.publicKey);
      toast("Public key copied");
    }
  };

  // ── Render ──

  if (loading && !data) {
    return (
      <div style={S.panel}>
        <div style={{ color: "var(--text-muted)", textAlign: "center", marginTop: 20 }}>Loading secrets...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={S.panel}>
        <div style={{ color: "var(--text-dim)", textAlign: "center", marginTop: 20 }}>Secrets status unavailable</div>
      </div>
    );
  }

  const Pill = ({ set, label }: { set: boolean; label?: string }) => (
    <span style={S.pill(set)}>{label ?? (set ? "set" : "unset")}</span>
  );

  const CLICard = ({ name, configured, authenticated, user }: { name: string; configured: boolean; authenticated: boolean; user?: string }) => (
    <div style={S.cliCard(authenticated)}>
      <span style={{ fontWeight: 600 }}>{name}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {user && <span style={S.mono}>{user}</span>}
        <Pill set={authenticated} label={authenticated ? "auth" : configured ? "token" : "none"} />
      </span>
    </div>
  );

  return (
    <div style={S.panel}>
      {/* Feedback toast */}
      <div style={S.feedback(feedback.msg ? feedback.type : "")}>{feedback.msg}</div>

      {/* ── AI API Keys ── */}
      <div style={S.section}>
        <div style={S.sectionHeader}>AI API Keys</div>
        <div style={S.row}>
          <span style={S.label}>Anthropic</span>
          <Pill set={data.aiKeys.anthropic} />
        </div>
        <div style={S.row}>
          <span style={S.label}>OpenAI</span>
          <Pill set={data.aiKeys.openai} />
        </div>
        <div style={S.row}>
          <span style={S.label}>Gemini</span>
          <Pill set={data.aiKeys.gemini} />
        </div>
      </div>

      {/* ── GitHub & Git ── */}
      <div style={S.section}>
        <div style={S.sectionHeader}>GitHub & Git</div>
        <div style={S.row}>
          <span style={S.label}>GH_TOKEN</span>
          <Pill set={data.github.token} />
        </div>
        <div style={S.row}>
          <span style={S.label}>SSH Key</span>
          <Pill set={data.github.sshKey} />
        </div>
        <div style={{ marginTop: 6 }}>
          <input
            style={{ ...S.input, marginBottom: 4 }}
            value={gitName}
            onChange={(e) => { setGitName(e.target.value); setGitDirty(true); }}
            placeholder="git user.name"
          />
          <input
            style={{ ...S.input, marginBottom: 4 }}
            value={gitEmail}
            onChange={(e) => { setGitEmail(e.target.value); setGitDirty(true); }}
            placeholder="git user.email"
          />
          {gitDirty && (
            <button
              style={S.btnAccent}
              onClick={saveGit}
              disabled={busy === "git"}
            >
              {busy === "git" ? "Saving..." : "Save Git Config"}
            </button>
          )}
        </div>
      </div>

      {/* ── Cloud CLIs ── */}
      <div style={S.section}>
        <div style={S.sectionHeader}>Cloud CLIs</div>
        <CLICard name="Railway" {...data.cloudCLIs.railway} />
        <CLICard name="Vercel" {...data.cloudCLIs.vercel} />
        <CLICard name="Supabase" {...data.cloudCLIs.supabase} />
        <CLICard name="Cloudflare" {...data.cloudCLIs.cloudflare} />
        <div style={S.cliCard(data.cloudCLIs.vault.configured)}>
          <span style={{ fontWeight: 600 }}>Vault</span>
          <Pill set={data.cloudCLIs.vault.configured} label={data.cloudCLIs.vault.configured ? "configured" : "none"} />
        </div>
      </div>

      {/* ── SSH Keys ── */}
      <div style={S.section}>
        <div style={S.sectionHeader}>SSH Keys</div>
        <div style={S.row}>
          <span style={S.label}>Private</span>
          <Pill set={data.ssh.hasPrivateKey} />
        </div>
        <div style={S.row}>
          <span style={S.label}>Public</span>
          <Pill set={data.ssh.hasPublicKey} />
        </div>
        {data.ssh.fingerprint && (
          <div style={{ ...S.mono, padding: "2px 0", overflow: "hidden", textOverflow: "ellipsis" }}>
            {data.ssh.fingerprint}
          </div>
        )}
        {data.ssh.publicKey && (
          <div style={{ marginTop: 4 }}>
            <textarea
              style={{ ...S.textarea, height: 48 }}
              value={data.ssh.publicKey}
              readOnly
              onClick={copyPubKey}
              title="Click to copy"
            />
          </div>
        )}
        <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
          {!data.ssh.hasPrivateKey ? (
            <button style={S.btnAccent} onClick={() => generateSSH(false)} disabled={busy === "ssh-gen"}>
              {busy === "ssh-gen" ? "..." : "Generate"}
            </button>
          ) : (
            <button style={S.btn} onClick={() => generateSSH(true)} disabled={busy === "ssh-gen"}>
              {busy === "ssh-gen" ? "..." : "Regenerate"}
            </button>
          )}
          {data.ssh.hasPublicKey && data.github.token && (
            <button style={S.btnAccent} onClick={uploadSSHToGH} disabled={busy === "ssh-gh"}>
              {busy === "ssh-gh" ? "..." : "Upload to GH"}
            </button>
          )}
        </div>
      </div>

      {/* ── Container ── */}
      <div style={S.section}>
        <div style={S.sectionHeader}>Container</div>
        <div style={S.row}>
          <span style={S.label}>User</span>
          <span style={S.value}>{data.container.user}</span>
        </div>
        <div style={S.row}>
          <span style={S.label}>Hostname</span>
          <span style={S.value}>{data.container.hostname}</span>
        </div>
        <div style={S.row}>
          <span style={S.label}>Terminal</span>
          <span style={S.value}>{data.terminal.user}</span>
        </div>
        <div style={S.row}>
          <span style={S.label}>Password</span>
          <Pill set={!data.terminal.passwordDefault} label={data.terminal.passwordDefault ? "default" : "custom"} />
        </div>
      </div>

      {/* ── Other ── */}
      <div style={S.section}>
        <div style={S.sectionHeader}>Other</div>
        <div style={S.row}>
          <span style={S.label}>Webhook URL</span>
          <Pill set={data.webhooks.url} />
        </div>
        <div style={S.row}>
          <span style={S.label}>Webhook Secret</span>
          <Pill set={data.webhooks.secret} />
        </div>
        {data.agentLimits.memLimit && (
          <div style={S.row}>
            <span style={S.label}>Mem Limit</span>
            <span style={S.value}>{data.agentLimits.memLimit}</span>
          </div>
        )}
        {data.agentLimits.nproc && (
          <div style={S.row}>
            <span style={S.label}>Max Procs</span>
            <span style={S.value}>{data.agentLimits.nproc}</span>
          </div>
        )}
      </div>
    </div>
  );
}
