import { useTerminalStore } from "../store/terminals";
import { Terminal } from "./Terminal";

export function TerminalTabs() {
  const { tabs, activeTabId, setActive, closeTab } = useTerminalStore();

  if (tabs.length === 0) {
    return (
      <div className="terminal-empty">
        <p>No terminals open</p>
        <p className="hint">Click a session in the sidebar to open a terminal</p>
      </div>
    );
  }

  return (
    <div className="terminal-tabs">
      <div className="tab-bar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? "active" : ""}`}
            onClick={() => setActive(tab.id)}
          >
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
            <Terminal tabId={tab.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
