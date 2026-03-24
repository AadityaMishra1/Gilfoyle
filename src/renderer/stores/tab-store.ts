/**
 * Per-project terminal tab store.
 *
 * Tabs are keyed by projectPath so switching between projects preserves
 * each project's terminal tabs independently. When you switch from
 * Project A to Project B and back, Project A's tabs are still there.
 */

import { create } from "zustand";

export interface TabEntry {
  sessionId: string;
  name: string;
  cwd: string;
  isActive: boolean;
}

interface TabStore {
  /** Map: projectPath → tab list */
  tabsByProject: Record<string, TabEntry[]>;
  /** Map: projectPath → active tab sessionId */
  activeTabByProject: Record<string, string | null>;
  /** Set of projectPaths that have been booted (don't re-boot on switch) */
  bootedProjects: Set<string>;

  getTabs: (projectPath: string) => TabEntry[];
  getActiveTabId: (projectPath: string) => string | null;
  isBooted: (projectPath: string) => boolean;

  setTabs: (projectPath: string, tabs: TabEntry[]) => void;
  addTab: (projectPath: string, tab: TabEntry) => void;
  removeTab: (projectPath: string, sessionId: string) => void;
  updateTab: (
    projectPath: string,
    sessionId: string,
    updates: Partial<TabEntry>,
  ) => void;
  setActiveTabId: (projectPath: string, tabId: string | null) => void;
  markBooted: (projectPath: string) => void;
}

export const useTabStore = create<TabStore>((set, get) => ({
  tabsByProject: {},
  activeTabByProject: {},
  bootedProjects: new Set(),

  getTabs: (projectPath) => get().tabsByProject[projectPath] ?? [],

  getActiveTabId: (projectPath) =>
    get().activeTabByProject[projectPath] ?? null,

  isBooted: (projectPath) => get().bootedProjects.has(projectPath),

  setTabs: (projectPath, tabs) =>
    set((state) => ({
      tabsByProject: { ...state.tabsByProject, [projectPath]: tabs },
    })),

  addTab: (projectPath, tab) =>
    set((state) => {
      const existing = state.tabsByProject[projectPath] ?? [];
      return {
        tabsByProject: {
          ...state.tabsByProject,
          [projectPath]: [...existing, tab],
        },
        activeTabByProject: {
          ...state.activeTabByProject,
          [projectPath]: tab.sessionId,
        },
      };
    }),

  removeTab: (projectPath, sessionId) =>
    set((state) => {
      const existing = state.tabsByProject[projectPath] ?? [];
      const next = existing.filter((t) => t.sessionId !== sessionId);
      const currentActive = state.activeTabByProject[projectPath];
      let newActive = currentActive;
      if (currentActive === sessionId) {
        const removedIndex = existing.findIndex(
          (t) => t.sessionId === sessionId,
        );
        newActive =
          next.length === 0
            ? null
            : (next[Math.max(0, removedIndex - 1)]?.sessionId ?? null);
      }
      return {
        tabsByProject: { ...state.tabsByProject, [projectPath]: next },
        activeTabByProject: {
          ...state.activeTabByProject,
          [projectPath]: newActive,
        },
      };
    }),

  updateTab: (projectPath, sessionId, updates) =>
    set((state) => {
      const existing = state.tabsByProject[projectPath] ?? [];
      return {
        tabsByProject: {
          ...state.tabsByProject,
          [projectPath]: existing.map((t) =>
            t.sessionId === sessionId ? { ...t, ...updates } : t,
          ),
        },
      };
    }),

  setActiveTabId: (projectPath, tabId) =>
    set((state) => ({
      activeTabByProject: {
        ...state.activeTabByProject,
        [projectPath]: tabId,
      },
    })),

  markBooted: (projectPath) =>
    set((state) => {
      const next = new Set(state.bootedProjects);
      next.add(projectPath);
      return { bootedProjects: next };
    }),
}));
