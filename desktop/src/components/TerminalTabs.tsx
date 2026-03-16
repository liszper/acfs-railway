import { useTerminalStore } from "../store/terminals";
import { Terminal } from "./Terminal";

export function TerminalTabs() {
  const { tabs, activeTabId, setActive, closeTab, reopenTab } = useTerminalStore();

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
                <span>Disconnected</span>
                <button
                  className="btn-reconnect"
                  onClick={() => reopenTab(tab.sessionName, tab.id)}
                >
                  Reconnect
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
