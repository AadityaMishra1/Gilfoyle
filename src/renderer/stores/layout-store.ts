import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ActiveInfoTab = "activity" | "git" | "tools";

interface LayoutStore {
  sidebarWidth: number;
  infoPanelHeight: number; // percentage 0-100
  activeInfoTab: ActiveInfoTab;
  sidebarCollapsed: boolean;
  infoPanelCollapsed: boolean;
  editorSplitPct: number; // percentage of main area for terminal (rest = editor)

  setActiveInfoTab: (tab: ActiveInfoTab) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setInfoPanelHeight: (pct: number) => void;
  setSidebarWidth: (width: number) => void;
  setEditorSplitPct: (pct: number) => void;
  toggleInfoPanel: () => void;
  setInfoPanelCollapsed: (collapsed: boolean) => void;
}

export const useLayoutStore = create<LayoutStore>()(
  persist(
    (set, get) => ({
      sidebarWidth: 240,
      infoPanelHeight: 25,
      activeInfoTab: "activity",
      sidebarCollapsed: false,
      infoPanelCollapsed: false,
      editorSplitPct: 50,

      setActiveInfoTab: (tab) => {
        const { infoPanelCollapsed } = get();
        // Opening a tab should expand the panel if collapsed
        if (infoPanelCollapsed) {
          set({ activeInfoTab: tab, infoPanelCollapsed: false });
        } else {
          set({ activeInfoTab: tab });
        }
      },

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      setInfoPanelHeight: (pct) =>
        set({ infoPanelHeight: Math.max(5, Math.min(70, pct)) }),

      setSidebarWidth: (width) =>
        set({ sidebarWidth: Math.max(180, Math.min(360, width)) }),

      setEditorSplitPct: (pct) =>
        set({ editorSplitPct: Math.max(20, Math.min(80, pct)) }),

      toggleInfoPanel: () =>
        set((s) => ({ infoPanelCollapsed: !s.infoPanelCollapsed })),

      setInfoPanelCollapsed: (collapsed) =>
        set({ infoPanelCollapsed: collapsed }),
    }),
    {
      name: "gilfoyle:layout",
      partialize: (state) => ({
        sidebarWidth: state.sidebarWidth,
        infoPanelHeight: state.infoPanelHeight,
        activeInfoTab: state.activeInfoTab,
        sidebarCollapsed: state.sidebarCollapsed,
        infoPanelCollapsed: state.infoPanelCollapsed,
        editorSplitPct: state.editorSplitPct,
      }),
      // Migrate persisted "files" tab (removed) to "activity"
      merge: (persisted, current) => {
        const p = persisted as Record<string, unknown>;
        if (p?.["activeInfoTab"] === "files") {
          p["activeInfoTab"] = "activity";
        }
        return { ...current, ...p };
      },
    },
  ),
);
