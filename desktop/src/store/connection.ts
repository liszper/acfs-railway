import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { useTerminalStore } from "./terminals";

interface ConnectionConfig {
  sshHost: string;
  sshPort: number;
  user: string;
  password: string;
  apiUrl: string;
}

type Status = "disconnected" | "connecting" | "connected" | "reconnecting" | "offline";

interface ConnectionStore extends ConnectionConfig {
  status: Status;
  error: string | null;
  reconnectAttempt: number;
  connect: (config: ConnectionConfig) => Promise<void>;
  disconnect: () => Promise<void>;
  reconnect: () => Promise<void>;
  setOffline: () => void;
  setOnline: () => void;
}

const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAYS = [2000, 4000, 8000, 15000, 30000];

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let healthTimer: ReturnType<typeof setInterval> | null = null;

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  sshHost: "crossover.proxy.rlwy.net",
  sshPort: 52992,
  user: "dev",
  password: "",
  apiUrl: "https://acfs-production.up.railway.app",
  status: "disconnected",
  error: null,
  reconnectAttempt: 0,

  connect: async (config) => {
    set({ status: "connecting", error: null, reconnectAttempt: 0 });
    try {
      await invoke("connect_ssh", {
        host: config.sshHost,
        port: config.sshPort,
        user: config.user,
        password: config.password,
        apiUrl: config.apiUrl,
      });
      set({ ...config, status: "connected", error: null });
      startHealthCheck();
    } catch (e) {
      set({ ...config, status: "disconnected", error: String(e) });
    }
  },

  disconnect: async () => {
    stopHealthCheck();
    stopReconnect();
    try { await invoke("disconnect_ssh"); } catch {}
    useTerminalStore.getState().clearAll();
    set({ status: "disconnected", error: null, reconnectAttempt: 0 });
  },

  reconnect: async () => {
    const { sshHost, sshPort, user, password, apiUrl, status } = get();
    if (status === "connecting" || status === "connected") return;
    if (!password) { set({ status: "disconnected", error: "No credentials saved" }); return; }

    const attempt = get().reconnectAttempt + 1;
    if (attempt > MAX_RECONNECT_ATTEMPTS) {
      set({ status: "disconnected", error: `Failed after ${MAX_RECONNECT_ATTEMPTS} attempts` });
      return;
    }

    set({ status: "reconnecting", reconnectAttempt: attempt, error: null });

    try {
      try { await invoke("disconnect_ssh"); } catch {}

      await invoke("connect_ssh", {
        host: sshHost, port: sshPort, user, password, apiUrl,
      });
      set({ status: "connected", error: null, reconnectAttempt: 0 });
      startHealthCheck();

      // Re-open terminals
      const tabs = useTerminalStore.getState().tabs;
      for (const tab of tabs) {
        if (tab.status === "disconnected") {
          try {
            await useTerminalStore.getState().reopenTab(tab.sessionName, tab.id);
          } catch {}
        }
      }
    } catch (e) {
      const delay = RECONNECT_DELAYS[Math.min(attempt - 1, RECONNECT_DELAYS.length - 1)];
      set({ status: "reconnecting", error: `Attempt ${attempt} failed, retrying in ${Math.round(delay / 1000)}s...` });
      scheduleReconnect(delay);
    }
  },

  setOffline: () => {
    stopHealthCheck();
    if (get().status === "connected") {
      set({ status: "offline", error: "Network offline" });
    }
  },

  setOnline: () => {
    if (get().status === "offline") {
      set({ reconnectAttempt: 0 });
      get().reconnect();
    }
  },
}));

function scheduleReconnect(delay: number) {
  stopReconnect();
  reconnectTimer = setTimeout(() => {
    useConnectionStore.getState().reconnect();
  }, delay);
}

function stopReconnect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
}

function startHealthCheck() {
  stopHealthCheck();
  healthTimer = setInterval(async () => {
    const { status } = useConnectionStore.getState();
    if (status !== "connected") return;

    try {
      // Light API ping — tests both API reachability and auth
      await invoke("api_request", { method: "GET", path: "/api/sessions", body: null });
      // API works — connection is healthy, no action needed
    } catch {
      // API unreachable — check if SSH is also dead
      console.warn("[health] API unreachable, checking SSH...");
      try {
        const alive = await invoke<boolean>("connection_status");
        if (!alive) {
          console.warn("[health] SSH dead, triggering reconnect");
          useTerminalStore.getState().clearAll();
          useConnectionStore.setState({ status: "reconnecting", reconnectAttempt: 0 });
          useConnectionStore.getState().reconnect();
        }
      } catch {
        console.warn("[health] SSH check failed, triggering reconnect");
        useTerminalStore.getState().clearAll();
        useConnectionStore.setState({ status: "reconnecting", reconnectAttempt: 0 });
        useConnectionStore.getState().reconnect();
      }
    }
  }, 30000); // every 30s
}

function stopHealthCheck() {
  if (healthTimer) { clearInterval(healthTimer); healthTimer = null; }
}

if (typeof window !== "undefined") {
  window.addEventListener("offline", () => useConnectionStore.getState().setOffline());
  window.addEventListener("online", () => useConnectionStore.getState().setOnline());
}
