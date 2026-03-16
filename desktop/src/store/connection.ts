import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

interface ConnectionConfig {
  sshHost: string;
  sshPort: number;
  user: string;
  password: string;
  apiUrl: string;
}

interface ConnectionStore extends ConnectionConfig {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  connect: (config: ConnectionConfig) => Promise<void>;
  disconnect: () => Promise<void>;
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  sshHost: "crossover.proxy.rlwy.net",
  sshPort: 52992,
  user: "dev",
  password: "",
  apiUrl: "https://acfs-production.up.railway.app",
  connected: false,
  connecting: false,
  error: null,

  connect: async (config) => {
    set({ connecting: true, error: null });
    try {
      await invoke("connect_ssh", {
        host: config.sshHost,
        port: config.sshPort,
        user: config.user,
        password: config.password,
        apiUrl: config.apiUrl,
      });
      set({ ...config, connected: true, connecting: false });
    } catch (e) {
      set({ connecting: false, error: String(e) });
    }
  },

  disconnect: async () => {
    try {
      await invoke("disconnect_ssh");
    } catch {}
    set({ connected: false });
  },
}));
