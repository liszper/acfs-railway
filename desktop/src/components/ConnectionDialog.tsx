import { useState } from "react";
import { useConnectionStore } from "../store/connection";

export function ConnectionDialog() {
  const { connect, connecting, error } = useConnectionStore();
  const [config, setConfig] = useState({
    sshHost: "",
    sshPort: 2222,
    user: "dev",
    password: "",
    apiUrl: "",
  });

  const handleConnect = () => {
    const apiUrl = config.apiUrl || `https://${config.sshHost.replace(/:.*/, "")}`;
    connect({ ...config, apiUrl });
  };

  return (
    <div className="connection-dialog">
      <div className="connection-card">
        <h1>ACFS Desktop</h1>
        <div className="field">
          <label>SSH Host</label>
          <input
            value={config.sshHost}
            onChange={(e) => setConfig({ ...config, sshHost: e.target.value })}
            placeholder="acfs-production.up.railway.app"
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Port</label>
            <input
              type="number"
              value={config.sshPort}
              onChange={(e) => setConfig({ ...config, sshPort: parseInt(e.target.value) || 2222 })}
            />
          </div>
          <div className="field">
            <label>User</label>
            <input
              value={config.user}
              onChange={(e) => setConfig({ ...config, user: e.target.value })}
            />
          </div>
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={config.password}
            onChange={(e) => setConfig({ ...config, password: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && handleConnect()}
          />
        </div>
        <div className="field">
          <label>API URL (auto-derived if empty)</label>
          <input
            value={config.apiUrl}
            onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
            placeholder="https://acfs-production.up.railway.app"
          />
        </div>
        {error && <div className="error">{error}</div>}
        <button onClick={handleConnect} disabled={connecting} className="btn-connect">
          {connecting ? "Connecting..." : "Connect"}
        </button>
      </div>
    </div>
  );
}
