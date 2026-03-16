import { useEffect, useState, useCallback } from "react";
import { apiGet, apiPost } from "../api/client";

interface FileChange {
  file: string;
  status: string;
}

interface GitStatus {
  branch: string;
  remote: string;
  ahead: number;
  behind: number;
  staged: FileChange[];
  modified: FileChange[];
  untracked: string[];
  conflicts: string[];
  clean: boolean;
}

interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}

interface Props {
  projectName: string;
  onBack: () => void;
}

function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const S: Record<string, React.CSSProperties> = {
  panel: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
    fontSize: "0.65rem",
    color: "var(--text)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 8px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-1)",
    flexShrink: 0,
  },
  backBtn: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: "0.7rem",
    padding: "2px 4px",
  },
  projectName: {
    fontWeight: 600,
    color: "var(--text)",
    fontSize: "0.65rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    flex: 1,
  },
  branchBadge: {
    fontSize: "0.55rem",
    background: "var(--bg-3)",
    color: "var(--accent)",
    padding: "1px 5px",
    borderRadius: 3,
    fontFamily: "monospace",
    whiteSpace: "nowrap" as const,
  },
  refreshBtn: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: "0.7rem",
    padding: "2px 4px",
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "4px 8px",
  },
  statusBar: {
    display: "flex",
    gap: 8,
    padding: "3px 0",
    fontSize: "0.55rem",
    color: "var(--text-muted)",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "4px 0 2px",
    cursor: "pointer",
    userSelect: "none" as const,
    fontSize: "0.6rem",
    fontWeight: 600,
  },
  countBadge: {
    fontSize: "0.5rem",
    background: "var(--bg-3)",
    padding: "0 4px",
    borderRadius: 3,
    marginLeft: 4,
  },
  fileRow: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "1px 0",
    fontSize: "0.55rem",
  },
  fileName: {
    fontFamily: "monospace",
    fontSize: "0.55rem",
    color: "var(--text-muted)",
    cursor: "pointer",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    flex: 1,
  },
  fileBtn: {
    background: "none",
    border: "1px solid var(--border-subtle)",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: "0.5rem",
    padding: "0 3px",
    borderRadius: 2,
    lineHeight: "14px",
    flexShrink: 0,
  },
  stageAllBtn: {
    background: "none",
    border: "1px solid var(--border-subtle)",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: "0.55rem",
    padding: "2px 6px",
    borderRadius: 3,
    marginBottom: 4,
  },
  diffViewer: {
    fontFamily: "monospace",
    fontSize: "0.5rem",
    background: "var(--bg-0)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 3,
    padding: 4,
    maxHeight: 160,
    overflowY: "auto" as const,
    whiteSpace: "pre" as const,
    margin: "2px 0 4px",
    lineHeight: 1.4,
  },
  commitSection: {
    padding: "6px 0",
    borderTop: "1px solid var(--border-subtle)",
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
  },
  commitInput: {
    background: "var(--bg-0)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 3,
    color: "var(--text)",
    fontSize: "0.55rem",
    padding: "4px 6px",
    resize: "vertical" as const,
    fontFamily: "inherit",
    minHeight: 28,
  },
  actionRow: {
    display: "flex",
    gap: 4,
  },
  actionBtn: {
    flex: 1,
    background: "var(--bg-2)",
    border: "1px solid var(--border-subtle)",
    color: "var(--text)",
    cursor: "pointer",
    fontSize: "0.55rem",
    padding: "3px 6px",
    borderRadius: 3,
  },
  commitBtn: {
    background: "var(--accent)",
    border: "none",
    color: "#fff",
    cursor: "pointer",
    fontSize: "0.55rem",
    padding: "3px 8px",
    borderRadius: 3,
  },
  logSection: {
    padding: "6px 0",
    borderTop: "1px solid var(--border-subtle)",
  },
  logItem: {
    display: "flex",
    flexDirection: "column" as const,
    padding: "2px 0",
    gap: 1,
  },
  logHash: {
    fontFamily: "monospace",
    color: "var(--accent)",
    fontSize: "0.5rem",
  },
  logMessage: {
    fontSize: "0.55rem",
    color: "var(--text)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  logMeta: {
    fontSize: "0.5rem",
    color: "var(--text-dim)",
  },
  feedback: {
    fontSize: "0.5rem",
    padding: "2px 0",
  },
  error: {
    color: "var(--red)",
    fontSize: "0.5rem",
    padding: "2px 0",
  },
};

export function GitPanel({ projectName, onBack }: Props) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [commitMsg, setCommitMsg] = useState("");
  const [expandedDiff, setExpandedDiff] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState<string>("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(""), 3000);
  };

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(""), 5000);
  };

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ info: unknown; status: GitStatus }>(
        `/api/projects/${projectName}/detail`
      );
      setStatus(data.status);
    } catch (e) {
      showError(String(e));
    }
    setLoading(false);
  }, [projectName]);

  const loadLog = useCallback(async () => {
    try {
      const data = await apiGet<{ commits: CommitInfo[] }>(
        `/api/projects/${projectName}/log?limit=10`
      );
      setCommits(data.commits || []);
    } catch {}
  }, [projectName]);

  const refresh = useCallback(async () => {
    await Promise.all([loadDetail(), loadLog()]);
  }, [loadDetail, loadLog]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadDiff = async (file: string, staged: boolean) => {
    const key = `${staged ? "s" : "m"}:${file}`;
    if (expandedDiff === key) {
      setExpandedDiff(null);
      return;
    }
    setDiffLoading(true);
    setExpandedDiff(key);
    try {
      const data = await apiGet<{ diff: string; error?: string }>(
        `/api/projects/${projectName}/diff?file=${encodeURIComponent(file)}&staged=${staged}`
      );
      setDiffContent(data.error ? `Error: ${data.error}` : data.diff || "(no diff)");
    } catch (e) {
      setDiffContent(String(e));
    }
    setDiffLoading(false);
  };

  const stageFile = async (file: string) => {
    setBusy(true);
    try {
      await apiPost(`/api/projects/${projectName}/stage`, { files: [file] });
      showFeedback("Staged");
      await loadDetail();
    } catch (e) { showError(String(e)); }
    setBusy(false);
  };

  const unstageFile = async (file: string) => {
    setBusy(true);
    try {
      await apiPost(`/api/projects/${projectName}/unstage`, { files: [file] });
      showFeedback("Unstaged");
      await loadDetail();
    } catch (e) { showError(String(e)); }
    setBusy(false);
  };

  const stageAll = async () => {
    setBusy(true);
    try {
      await apiPost(`/api/projects/${projectName}/stage-all`, {});
      showFeedback("All staged");
      await loadDetail();
    } catch (e) { showError(String(e)); }
    setBusy(false);
  };

  const doCommit = async () => {
    if (!commitMsg.trim() || !status || status.staged.length === 0) return;
    setBusy(true);
    try {
      await apiPost(`/api/projects/${projectName}/commit`, { message: commitMsg.trim() });
      setCommitMsg("");
      showFeedback("Committed");
      await refresh();
    } catch (e) { showError(String(e)); }
    setBusy(false);
  };

  const doPush = async () => {
    setBusy(true);
    try {
      await apiPost(`/api/projects/${projectName}/push`, {});
      showFeedback("Pushed successfully");
      await refresh();
    } catch (e) { showError(String(e)); }
    setBusy(false);
  };

  const doPull = async () => {
    setBusy(true);
    try {
      await apiPost(`/api/projects/${projectName}/pull`, {});
      showFeedback("Pulled successfully");
      await refresh();
    } catch (e) { showError(String(e)); }
    setBusy(false);
  };

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderDiffLine = (line: string, i: number) => {
    let color = "var(--text-dim)";
    if (line.startsWith("+")) color = "var(--green)";
    else if (line.startsWith("-")) color = "var(--red)";
    else if (line.startsWith("@@")) color = "var(--accent)";
    return (
      <div key={i} style={{ color }}>
        {line}
      </div>
    );
  };

  const renderDiffViewer = (fileKey: string) => {
    if (expandedDiff !== fileKey) return null;
    return (
      <div style={S.diffViewer}>
        {diffLoading
          ? <span style={{ color: "var(--text-dim)" }}>Loading...</span>
          : diffContent.split("\n").map(renderDiffLine)}
      </div>
    );
  };

  const hasChanges =
    status &&
    (status.staged.length > 0 ||
      status.modified.length > 0 ||
      status.untracked.length > 0);

  return (
    <div style={S.panel}>
      {/* Header */}
      <div style={S.header}>
        <button style={S.backBtn} onClick={onBack} title="Back">
          &larr;
        </button>
        <span style={S.projectName}>{projectName}</span>
        {status?.branch && <span style={S.branchBadge}>{status.branch}</span>}
        <button
          style={S.refreshBtn}
          onClick={refresh}
          disabled={loading}
          title="Refresh"
        >
          {loading ? "..." : "\u21BB"}
        </button>
      </div>

      <div style={S.scrollArea}>
        {/* Feedback / Error */}
        {feedback && (
          <div style={{ ...S.feedback, color: "var(--green)" }}>{feedback}</div>
        )}
        {error && <div style={S.error}>{error}</div>}

        {/* Status bar */}
        {status?.remote && (
          <div style={S.statusBar}>
            {status.ahead > 0 && (
              <span style={{ color: "var(--green)" }}>
                &uarr;{status.ahead} ahead
              </span>
            )}
            {status.behind > 0 && (
              <span style={{ color: "var(--yellow)" }}>
                &darr;{status.behind} behind
              </span>
            )}
            {status.ahead === 0 && status.behind === 0 && (
              <span>Up to date</span>
            )}
          </div>
        )}

        {/* Stage All button */}
        {hasChanges && (status!.modified.length > 0 || status!.untracked.length > 0) && (
          <button style={S.stageAllBtn} onClick={stageAll} disabled={busy}>
            Stage All
          </button>
        )}

        {/* Staged files */}
        {status && status.staged.length > 0 && (
          <div>
            <div
              style={{ ...S.sectionHeader, color: "var(--green)" }}
              onClick={() => toggleSection("staged")}
            >
              <span>
                {collapsedSections.staged ? "\u25B6" : "\u25BC"} Staged
                <span style={S.countBadge}>{status.staged.length}</span>
              </span>
            </div>
            {!collapsedSections.staged &&
              status.staged.map((f) => {
                const key = `s:${f.file}`;
                return (
                  <div key={f.file}>
                    <div style={S.fileRow}>
                      <span
                        style={S.fileName}
                        title={f.file}
                        onClick={() => loadDiff(f.file, true)}
                      >
                        {f.file}
                      </span>
                      <button
                        style={S.fileBtn}
                        onClick={() => unstageFile(f.file)}
                        disabled={busy}
                        title="Unstage"
                      >
                        &minus;
                      </button>
                    </div>
                    {renderDiffViewer(key)}
                  </div>
                );
              })}
          </div>
        )}

        {/* Modified files */}
        {status && status.modified.length > 0 && (
          <div>
            <div
              style={{ ...S.sectionHeader, color: "var(--yellow)" }}
              onClick={() => toggleSection("modified")}
            >
              <span>
                {collapsedSections.modified ? "\u25B6" : "\u25BC"} Modified
                <span style={S.countBadge}>{status.modified.length}</span>
              </span>
            </div>
            {!collapsedSections.modified &&
              status.modified.map((f) => {
                const key = `m:${f.file}`;
                return (
                  <div key={f.file}>
                    <div style={S.fileRow}>
                      <span
                        style={S.fileName}
                        title={f.file}
                        onClick={() => loadDiff(f.file, false)}
                      >
                        {f.file}
                      </span>
                      <button
                        style={S.fileBtn}
                        onClick={() => stageFile(f.file)}
                        disabled={busy}
                        title="Stage"
                      >
                        +
                      </button>
                    </div>
                    {renderDiffViewer(key)}
                  </div>
                );
              })}
          </div>
        )}

        {/* Untracked files */}
        {status && status.untracked.length > 0 && (
          <div>
            <div
              style={{ ...S.sectionHeader, color: "var(--text-dim)" }}
              onClick={() => toggleSection("untracked")}
            >
              <span>
                {collapsedSections.untracked ? "\u25B6" : "\u25BC"} Untracked
                <span style={S.countBadge}>{status.untracked.length}</span>
              </span>
            </div>
            {!collapsedSections.untracked &&
              status.untracked.map((file) => (
                <div key={file} style={S.fileRow}>
                  <span style={S.fileName} title={file}>
                    {file}
                  </span>
                  <button
                    style={S.fileBtn}
                    onClick={() => stageFile(file)}
                    disabled={busy}
                    title="Stage"
                  >
                    +
                  </button>
                </div>
              ))}
          </div>
        )}

        {/* Clean state */}
        {status?.clean && (
          <div style={{ color: "var(--text-dim)", fontSize: "0.55rem", padding: "6px 0" }}>
            Working tree clean
          </div>
        )}

        {/* Commit section */}
        <div style={S.commitSection}>
          <textarea
            style={S.commitInput}
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            placeholder="Commit message..."
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) doCommit();
            }}
          />
          <button
            style={{
              ...S.commitBtn,
              opacity: !commitMsg.trim() || !status || status.staged.length === 0 || busy ? 0.5 : 1,
              cursor: !commitMsg.trim() || !status || status.staged.length === 0 || busy ? "default" : "pointer",
            }}
            onClick={doCommit}
            disabled={!commitMsg.trim() || !status || status.staged.length === 0 || busy}
          >
            Commit
          </button>
        </div>

        {/* Push / Pull */}
        <div style={S.actionRow}>
          <button style={S.actionBtn} onClick={doPush} disabled={busy}>
            Push{status && status.ahead > 0 ? ` (${status.ahead})` : ""}
          </button>
          <button style={S.actionBtn} onClick={doPull} disabled={busy}>
            Pull{status && status.behind > 0 ? ` (${status.behind})` : ""}
          </button>
        </div>

        {/* Log */}
        <div style={S.logSection}>
          <div style={{ ...S.sectionHeader, color: "var(--text-muted)" }}>
            Recent Commits
          </div>
          {commits.length === 0 && (
            <div style={{ color: "var(--text-dim)", fontSize: "0.5rem" }}>
              No commits
            </div>
          )}
          {commits.map((c) => (
            <div key={c.hash} style={S.logItem}>
              <div>
                <span style={S.logHash}>{c.shortHash}</span>{" "}
                <span style={S.logMessage}>{c.message}</span>
              </div>
              <div style={S.logMeta}>
                {c.author} &middot; {timeAgo(c.date)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
