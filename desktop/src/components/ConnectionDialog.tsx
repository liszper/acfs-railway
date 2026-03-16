import { useState, useEffect } from "react";
import { useConnectionStore } from "../store/connection";

interface SavedConnection {
  id: string;
  label: string;
  sshHost: string;
  sshPort: number;
  user: string;
  password: string;
  apiUrl: string;
}

const STORAGE_KEY = "acfs-saved-connections";

function loadSaved(): SavedConnection[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch { return []; }
}

function saveToDisk(connections: SavedConnection[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
}

export function ConnectionDialog() {
  const { connect, status, error } = useConnectionStore();
  const connecting = status === "connecting";
  const [saved, setSaved] = useState<SavedConnection[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [config, setConfig] = useState({
    sshHost: "crossover.proxy.rlwy.net",
    sshPort: 52992,
    user: "dev",
    password: "",
    apiUrl: "https://acfs-production.up.railway.app",
    label: "",
    saveConnection: true,
  });

  useEffect(() => {
    const loaded = loadSaved();
    setSaved(loaded);
    if (loaded.length === 0) setShowForm(true);
  }, []);

  const handleConnect = () => {
    const apiUrl = config.apiUrl || `https://${config.sshHost.replace(/:.*/, "")}`;
    const connConfig = { ...config, apiUrl };

    if (config.saveConnection && config.password) {
      const entry: SavedConnection = {
        id: `${config.sshHost}:${config.sshPort}:${config.user}`,
        label: config.label || `${config.user}@${config.sshHost}`,
        sshHost: config.sshHost,
        sshPort: config.sshPort,
        user: config.user,
        password: config.password,
        apiUrl,
      };
      const updated = [entry, ...saved.filter((s) => s.id !== entry.id)];
      setSaved(updated);
      saveToDisk(updated);
    }

    connect(connConfig);
  };

  const quickConnect = (s: SavedConnection) => {
    connect({
      sshHost: s.sshHost,
      sshPort: s.sshPort,
      user: s.user,
      password: s.password,
      apiUrl: s.apiUrl,
    });
  };

  const deleteSaved = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = saved.filter((s) => s.id !== id);
    setSaved(updated);
    saveToDisk(updated);
    if (updated.length === 0) setShowForm(true);
  };

  const editSaved = (s: SavedConnection) => {
    setConfig({
      sshHost: s.sshHost,
      sshPort: s.sshPort,
      user: s.user,
      password: s.password,
      apiUrl: s.apiUrl,
      label: s.label,
      saveConnection: true,
    });
    setShowForm(true);
  };

  return (
    <div className="connection-dialog">
      <div className="connection-card">
        <h1>ACFS Desktop</h1>

        {saved.length > 0 && !showForm && (
          <>
            <div className="saved-list">
              {saved.map((s) => (
                <div key={s.id} className="saved-item" onClick={() => quickConnect(s)}>
                  <div className="saved-info">
                    <span className="saved-label">{s.label}</span>
                    <span className="saved-detail">{s.user}@{s.sshHost}:{s.sshPort}</span>
                  </div>
                  <div className="saved-actions">
                    <button className="saved-btn" onClick={(e) => { e.stopPropagation(); editSaved(s); }} title="Edit">✎</button>
                    <button className="saved-btn saved-btn-delete" onClick={(e) => deleteSaved(e, s.id)} title="Delete">×</button>
                  </div>
                </div>
              ))}
            </div>
            {error && <div className="error">{error}</div>}
            {connecting && <div className="connecting-hint">Connecting...</div>}
            <button className="btn-new-connection" onClick={() => setShowForm(true)}>
              + New Connection
            </button>
          </>
        )}

        {showForm && (
          <>
            {saved.length > 0 && (
              <button className="btn-back" onClick={() => setShowForm(false)}>
                ← Saved connections
              </button>
            )}
            <div className="field">
              <label>Label</label>
              <input
                value={config.label}
                onChange={(e) => setConfig({ ...config, label: e.target.value })}
                placeholder="My ACFS Server"
              />
            </div>
            <div className="field">
              <label>SSH Host</label>
              <input
                value={config.sshHost}
                onChange={(e) => setConfig({ ...config, sshHost: e.target.value })}
                placeholder="crossover.proxy.rlwy.net"
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
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={config.saveConnection}
                onChange={(e) => setConfig({ ...config, saveConnection: e.target.checked })}
              />
              Save connection
            </label>
            {error && <div className="error">{error}</div>}
            <button onClick={handleConnect} disabled={connecting} className="btn-connect">
              {connecting ? "Connecting..." : "Connect"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
