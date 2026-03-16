import { useState } from "react";
import { TerminalTabs } from "./TerminalTabs";
import { SessionsPanel } from "./SessionsPanel";
import { ProjectsPanel } from "./ProjectsPanel";
import { useConnectionStore } from "../store/connection";

type SidePanel = "sessions" | "tools" | "secrets" | "projects" | null;

const PANEL_ICONS: Record<string, string> = {
  sessions: "⊞",
  tools: "⚙",
  secrets: "⚷",
  projects: "◇",
};

function StatusBar() {
  const { status, error, reconnectAttempt, reconnect, disconnect } = useConnectionStore();

  if (status === "connected") return null;

  return (
    <div className={`status-bar status-${status}`}>
      <span className="status-dot" />
      <span className="status-text">
        {status === "reconnecting" && (error || `Reconnecting (attempt ${reconnectAttempt})...`)}
        {status === "offline" && "Offline — waiting for connection"}
      </span>
      <div className="status-actions">
        {status === "reconnecting" && (
          <button onClick={() => reconnect()} className="status-btn">Retry</button>
        )}
        <button onClick={() => disconnect()} className="status-btn status-btn-disconnect">Disconnect</button>
      </div>
    </div>
  );
}

export function MainLayout() {
  const [sidePanel, setSidePanel] = useState<SidePanel>("sessions");
  const disconnect = useConnectionStore((s) => s.disconnect);
  const status = useConnectionStore((s) => s.status);

  return (
    <div className="main-layout">
      <div className="sidebar">
        <div className="sidebar-nav">
          {(["sessions", "tools", "secrets", "projects"] as const).map((p) => (
            <button
              key={p}
              className={`sidebar-btn ${sidePanel === p ? "active" : ""}`}
              onClick={() => setSidePanel(sidePanel === p ? null : p)}
              title={p[0].toUpperCase() + p.slice(1)}
            >
              {PANEL_ICONS[p]}
            </button>
          ))}
        </div>
        <div className={`sidebar-status sidebar-status-${status}`} title={status} />
        <button className="sidebar-btn disconnect" onClick={disconnect} title="Disconnect">
          ⏻
        </button>
      </div>
      <div className="content-wrapper">
        <StatusBar />
        <div className="content">
          {sidePanel && (
            <div className="side-panel">
              {sidePanel === "sessions" && <SessionsPanel />}
              {sidePanel === "tools" && <div className="panel-placeholder">Tools (coming soon)</div>}
              {sidePanel === "secrets" && <div className="panel-placeholder">Secrets (coming soon)</div>}
              {sidePanel === "projects" && <ProjectsPanel />}
            </div>
          )}
          <div className="terminal-area">
            <TerminalTabs />
          </div>
        </div>
      </div>
    </div>
  );
}
