import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface TerminalTab {
  id: string;
  sessionName: string;
  projectPath?: string;
  status: "connecting" | "connected" | "disconnected";
  error?: string;
  disconnectedAt?: number;
}

interface TerminalStore {
  tabs: TerminalTab[];
  activeTabId: string | null;
  openTab: (sessionName: string, projectPath?: string, command?: string) => Promise<void>;
  reopenTab: (sessionName: string, oldTabId: string) => Promise<void>;
  closeTab: (tabId: string) => void;
  setActive: (tabId: string) => void;
  setTabStatus: (tabId: string, status: TerminalTab["status"], error?: string) => void;
  markDisconnected: (tabId: string, reason: string) => void;
  clearAll: (reason?: string) => void;
  reconnectAll: () => Promise<void>;
}

// Track listeners so we can clean them up when tabs close
const closeListeners = new Map<string, () => void>();

function listenForClose(tabId: string) {
  // Listen for terminal-closed-{tabId} events from Rust backend
  const unlistenPromise = listen<string>(`terminal-closed-${tabId}`, (event) => {
    const reason = event.payload || "Connection lost";
    useTerminalStore.getState().markDisconnected(tabId, reason);
  });
  unlistenPromise.then((unlisten) => {
    closeListeners.set(tabId, unlisten);
  });
}

function cleanupListener(tabId: string) {
  const unlisten = closeListeners.get(tabId);
  if (unlisten) {
    unlisten();
    closeListeners.delete(tabId);
  }
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: async (sessionName, projectPath, command) => {
    const existing = get().tabs.find((t) => t.sessionName === sessionName);
    if (existing) {
      // If it was disconnected, reconnect it
      if (existing.status === "disconnected") {
        get().reopenTab(sessionName, existing.id);
      } else {
        set({ activeTabId: existing.id });
      }
      return;
    }

    const tempId = `pending-${Date.now()}`;
    set((s) => ({
      tabs: [...s.tabs, { id: tempId, sessionName, projectPath, status: "connecting" }],
      activeTabId: tempId,
    }));

    try {
      const tabId = await invoke<string>("terminal_open", {
        sessionName,
        projectPath: projectPath || null,
      });
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tempId ? { id: tabId, sessionName, projectPath, status: "connected" } : t
        ),
        activeTabId: s.activeTabId === tempId ? tabId : s.activeTabId,
      }));
      listenForClose(tabId);

      // Send the launch command after the terminal is attached and shell is ready.
      // We wait 1.5s for: SSH attach (~200ms) + tmux attach (~300ms) + shell init (~500ms)
      if (command) {
        setTimeout(async () => {
          try {
            const data = Array.from(new TextEncoder().encode(command + "\n"));
            await invoke("terminal_write", { tabId, data });
          } catch {}
        }, 1500);
      }
    } catch (e) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tempId ? { ...t, status: "disconnected", error: String(e), disconnectedAt: Date.now() } : t
        ),
      }));
    }
  },

  reopenTab: async (sessionName, oldTabId) => {
    cleanupListener(oldTabId);
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === oldTabId ? { ...t, status: "connecting", error: undefined } : t
      ),
    }));

    const tab = get().tabs.find((t) => t.id === oldTabId);

    try {
      const tabId = await invoke<string>("terminal_open", {
        sessionName,
        projectPath: tab?.projectPath || null,
      });
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === oldTabId ? { id: tabId, sessionName, projectPath: tab?.projectPath, status: "connected", error: undefined, disconnectedAt: undefined } : t
        ),
        activeTabId: s.activeTabId === oldTabId ? tabId : s.activeTabId,
      }));
      listenForClose(tabId);
    } catch (e) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === oldTabId ? { ...t, status: "disconnected", error: String(e), disconnectedAt: Date.now() } : t
        ),
      }));
    }
  },

  closeTab: (tabId) => {
    cleanupListener(tabId);
    try { invoke("terminal_close", { tabId }); } catch {}
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== tabId);
      const activeTabId = s.activeTabId === tabId
        ? (tabs[tabs.length - 1]?.id ?? null)
        : s.activeTabId;
      return { tabs, activeTabId };
    });
  },

  setActive: (tabId) => set({ activeTabId: tabId }),

  setTabStatus: (tabId, status, error) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? {
        ...t,
        status,
        error: error || (status === "connected" ? undefined : t.error),
        disconnectedAt: status === "disconnected" ? Date.now() : undefined,
      } : t)),
    }));
  },

  markDisconnected: (tabId, reason) => {
    cleanupListener(tabId);
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? {
        ...t,
        status: "disconnected" as const,
        error: reason,
        disconnectedAt: Date.now(),
      } : t)),
    }));
  },

  clearAll: (reason) => {
    const { tabs } = get();
    for (const tab of tabs) {
      cleanupListener(tab.id);
    }
    set({
      tabs: tabs.map((t) => ({
        ...t,
        status: "disconnected" as const,
        error: reason || "SSH connection lost",
        disconnectedAt: Date.now(),
      })),
    });
  },

  reconnectAll: async () => {
    const { tabs } = get();
    const disconnected = tabs.filter((t) => t.status === "disconnected");
    for (const tab of disconnected) {
      try {
        await get().reopenTab(tab.sessionName, tab.id);
      } catch {}
    }
  },
}));
