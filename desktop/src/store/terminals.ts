import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

interface TerminalTab {
  id: string;
  sessionName: string;
  projectPath?: string;
  status: "connecting" | "connected" | "disconnected";
}

interface TerminalStore {
  tabs: TerminalTab[];
  activeTabId: string | null;
  openTab: (sessionName: string, projectPath?: string) => Promise<void>;
  reopenTab: (sessionName: string, oldTabId: string) => Promise<void>;
  closeTab: (tabId: string) => void;
  setActive: (tabId: string) => void;
  setTabStatus: (tabId: string, status: TerminalTab["status"]) => void;
  clearAll: () => void;
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: async (sessionName, projectPath) => {
    const existing = get().tabs.find((t) => t.sessionName === sessionName);
    if (existing) {
      set({ activeTabId: existing.id });
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
    } catch {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tempId ? { ...t, status: "disconnected" } : t
        ),
      }));
    }
  },

  reopenTab: async (sessionName, oldTabId) => {
    const tab = get().tabs.find((t) => t.id === oldTabId);
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === oldTabId ? { ...t, status: "connecting" } : t
      ),
    }));

    try {
      const tabId = await invoke<string>("terminal_open", {
        sessionName,
        projectPath: tab?.projectPath || null,
      });
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === oldTabId ? { id: tabId, sessionName, projectPath: tab?.projectPath, status: "connected" } : t
        ),
        activeTabId: s.activeTabId === oldTabId ? tabId : s.activeTabId,
      }));
    } catch {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === oldTabId ? { ...t, status: "disconnected" } : t
        ),
      }));
    }
  },

  closeTab: (tabId) => {
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

  setTabStatus: (tabId, status) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, status } : t)),
    }));
  },

  clearAll: () => {
    const { tabs } = get();
    set({
      tabs: tabs.map((t) => ({ ...t, status: "disconnected" as const })),
    });
  },
}));
