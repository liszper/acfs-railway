import { useState } from "react";
import { TerminalTabs } from "./TerminalTabs";
import { SessionsPanel } from "./SessionsPanel";
import { NtmPanel } from "./NtmPanel";
import { ProjectsPanel } from "./ProjectsPanel";
import { AgentMonitorPanel } from "./AgentMonitorPanel";
import { BeadsPanel } from "./BeadsPanel";
import { EventsPanel } from "./EventsPanel";
import { SystemPanel } from "./SystemPanel";
import { useConnectionStore } from "../store/connection";

type SidePanel = "sessions" | "ntm" | "projects" | "agents" | "beads" | "events" | "system" | null;

const PANEL_ICONS: { id: SidePanel & string; icon: string; label: string }[] = [
  { id: "sessions", icon: "⊞", label: "Sessions" },
  { id: "ntm",      icon: "⊛", label: "NTM" },
  { id: "projects",  icon: "◇", label: "Projects" },
  { id: "agents",    icon: "◉", label: "Agents" },
  { id: "beads",     icon: "◈", label: "Beads" },
  { id: "events",    icon: "◎", label: "Events" },
  { id: "system",    icon: "⚙", label: "System" },
];

function StatusBar() {
  const { status, error, reconnectAttempt, reconnect, disconnect } = useConnectionStore();

  if (status === "connected") return null;

  return (
    <div className={`status-bar status-${status}`}>
      <span className="status-dot" />
      <span className="status-text">
        {status === "reconnecting" && (
          <>
            Reconnecting{reconnectAttempt > 0 ? ` (attempt ${reconnectAttempt}/10)` : ""}
            {error && <span className="status-error"> — {error}</span>}
          </>
        )}
        {status === "offline" && (
          <>
            Network offline
            {error && <span className="status-error"> — {error}</span>}
          </>
        )}
      </span>
      <div className="status-actions">
        {(status === "reconnecting" || status === "offline") && (
          <button onClick={() => reconnect()} className="status-btn">Retry Now</button>
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
          {PANEL_ICONS.map((p) => (
            <button
              key={p.id}
              className={`sidebar-btn ${sidePanel === p.id ? "active" : ""}`}
              onClick={() => setSidePanel(sidePanel === p.id ? null : p.id)}
              title={p.label}
            >
              {p.icon}
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
              {sidePanel === "ntm" && <NtmPanel />}
              {sidePanel === "projects" && <ProjectsPanel />}
              {sidePanel === "agents" && <AgentMonitorPanel />}
              {sidePanel === "beads" && <BeadsPanel />}
              {sidePanel === "events" && <EventsPanel />}
              {sidePanel === "system" && <SystemPanel />}
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
