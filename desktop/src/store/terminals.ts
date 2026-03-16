import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

interface TerminalTab {
  id: string;
  sessionName: string;
}

interface TerminalStore {
  tabs: TerminalTab[];
  activeTabId: string | null;
  openTab: (sessionName: string) => Promise<void>;
  closeTab: (tabId: string) => Promise<void>;
  setActive: (tabId: string) => void;
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: async (sessionName) => {
    const tabId = await invoke<string>("terminal_open", { sessionName });
    const tab = { id: tabId, sessionName };
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tabId }));
  },

  closeTab: async (tabId) => {
    try { await invoke("terminal_close", { tabId }); } catch {}
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== tabId);
      const activeTabId = s.activeTabId === tabId ? (tabs[tabs.length - 1]?.id ?? null) : s.activeTabId;
      return { tabs, activeTabId };
    });
  },

  setActive: (tabId) => set({ activeTabId: tabId }),
}));
