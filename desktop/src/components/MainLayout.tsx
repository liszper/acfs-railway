import { useState } from "react";
import { TerminalTabs } from "./TerminalTabs";
import { SessionsPanel } from "./SessionsPanel";
import { useConnectionStore } from "../store/connection";

type SidePanel = "sessions" | "tools" | "secrets" | "projects" | null;

export function MainLayout() {
  const [sidePanel, setSidePanel] = useState<SidePanel>("sessions");
  const disconnect = useConnectionStore((s) => s.disconnect);

  return (
    <div className="main-layout">
      <div className="sidebar">
        <div className="sidebar-nav">
          {(["sessions", "tools", "secrets", "projects"] as const).map((p) => (
            <button
              key={p}
              className={`sidebar-btn ${sidePanel === p ? "active" : ""}`}
              onClick={() => setSidePanel(sidePanel === p ? null : p)}
            >
              {p[0].toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        <button className="sidebar-btn disconnect" onClick={disconnect}>
          Disconnect
        </button>
      </div>
      <div className="content">
        {sidePanel && (
          <div className="side-panel">
            {sidePanel === "sessions" && <SessionsPanel />}
            {sidePanel === "tools" && <div className="panel-placeholder">Tools (coming soon)</div>}
            {sidePanel === "secrets" && <div className="panel-placeholder">Secrets (coming soon)</div>}
            {sidePanel === "projects" && <div className="panel-placeholder">Projects (coming soon)</div>}
          </div>
        )}
        <div className="terminal-area">
          <TerminalTabs />
        </div>
      </div>
    </div>
  );
}
