import { useState } from "react";
import { ToolsPanel } from "./ToolsPanel";
import { SecretsPanel } from "./SecretsPanel";

export function SystemPanel() {
  const [tab, setTab] = useState<"tools" | "secrets">("tools");

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Tab bar */}
      <div style={{
        display: "flex",
        gap: "1px",
        padding: "4px 8px",
        borderBottom: "1px solid var(--border-subtle)",
        flexShrink: 0,
      }}>
        {(["tools", "secrets"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: "3px 0",
              background: tab === t ? "rgba(59,130,246,0.06)" : "none",
              border: "none",
              borderRadius: "3px",
              color: tab === t ? "var(--accent)" : "var(--text-dim)",
              cursor: "pointer",
              fontSize: "0.55rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              fontFamily: "var(--font-ui)",
              transition: "color 0.15s, background 0.15s",
            }}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {/* Panel content */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {tab === "tools" ? <ToolsPanel /> : <SecretsPanel />}
      </div>
    </div>
  );
}
