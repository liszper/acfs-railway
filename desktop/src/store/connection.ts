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
  healthCheck: () => Promise<boolean>;
}

const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000]; // exponential backoff, caps at 30s

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
      // Clean up old connection
      try { await invoke("disconnect_ssh"); } catch {}

      await invoke("connect_ssh", {
        host: sshHost, port: sshPort, user, password, apiUrl,
      });
      set({ status: "connected", error: null, reconnectAttempt: 0 });
      startHealthCheck();

      // Re-open terminals for all open tabs
      const tabs = useTerminalStore.getState().tabs;
      for (const tab of tabs) {
        try {
          await useTerminalStore.getState().reopenTab(tab.sessionName, tab.id);
        } catch {
          // Tab will show disconnected state
        }
      }
    } catch (e) {
      const delay = RECONNECT_DELAYS[Math.min(attempt - 1, RECONNECT_DELAYS.length - 1)];
      set({ status: "reconnecting", error: `Attempt ${attempt} failed, retrying in ${delay / 1000}s...` });
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

  healthCheck: async () => {
    try {
      const ok = await invoke<boolean>("connection_status");
      if (!ok && get().status === "connected") {
        set({ status: "reconnecting", reconnectAttempt: 0 });
        get().reconnect();
        return false;
      }
      return ok;
    } catch {
      if (get().status === "connected") {
        set({ status: "reconnecting", reconnectAttempt: 0 });
        get().reconnect();
      }
      return false;
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
  healthTimer = setInterval(() => {
    useConnectionStore.getState().healthCheck();
  }, 10000); // check every 10s
}

function stopHealthCheck() {
  if (healthTimer) { clearInterval(healthTimer); healthTimer = null; }
}

// Browser online/offline events
if (typeof window !== "undefined") {
  window.addEventListener("offline", () => useConnectionStore.getState().setOffline());
  window.addEventListener("online", () => useConnectionStore.getState().setOnline());
}
