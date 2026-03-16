import { useTerminalStore } from "../store/terminals";
import { useConnectionStore } from "../store/connection";
import { Terminal } from "./Terminal";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function TerminalTabs() {
  const { tabs, activeTabId, setActive, closeTab, reopenTab } = useTerminalStore();
  const connStatus = useConnectionStore((s) => s.status);
  const connError = useConnectionStore((s) => s.error);
  const reconnectAttempt = useConnectionStore((s) => s.reconnectAttempt);

  if (tabs.length === 0) {
    return (
      <div className="terminal-empty">
        <p>No terminals open</p>
        <p className="hint">Click a session to open a terminal</p>
      </div>
    );
  }

  return (
    <div className="terminal-tabs">
      <div className="tab-bar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? "active" : ""} tab-${tab.status}`}
            onClick={() => setActive(tab.id)}
          >
            {tab.status !== "connected" && (
              <span className={`tab-status-dot tab-status-dot-${tab.status}`} />
            )}
            <span className="tab-name">{tab.sessionName}</span>
            <button
              className="tab-close"
              onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="tab-content">
        {tabs.map((tab) => (
          <div key={tab.id} className="terminal-wrapper" style={{ display: tab.id === activeTabId ? "block" : "none" }}>
            {tab.status === "connected" && <Terminal tabId={tab.id} />}
            {tab.status === "connecting" && (
              <div className="terminal-status-overlay">
                <span className="spinner" />
                <span>Connecting to {tab.sessionName}...</span>
              </div>
            )}
            {tab.status === "disconnected" && (
              <div className="terminal-status-overlay">
                <span className="disconnected-icon">⊘</span>
                <span className="disconnected-reason">
                  {tab.error || "Disconnected"}
                </span>
                {tab.disconnectedAt && (
                  <span className="disconnected-time">
                    {timeAgo(tab.disconnectedAt)}
                  </span>
                )}

                {/* Show connection-level context */}
                {connStatus === "reconnecting" && (
                  <span className="disconnected-context">
                    Reconnecting to server{reconnectAttempt > 0 ? ` (attempt ${reconnectAttempt})` : ""}...
                    {connError && <span className="disconnected-detail">{connError}</span>}
                  </span>
                )}
                {connStatus === "offline" && (
                  <span className="disconnected-context">
                    Network offline — waiting for connectivity
                  </span>
                )}
                {connStatus === "disconnected" && (
                  <span className="disconnected-context">
                    Not connected to server
                    {connError && <span className="disconnected-detail">{connError}</span>}
                  </span>
                )}

                {connStatus === "connected" && (
                  <button
                    className="btn-reconnect"
                    onClick={() => reopenTab(tab.sessionName, tab.id)}
                  >
                    Reconnect
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
