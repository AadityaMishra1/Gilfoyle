import { create } from "zustand";

interface UIStore {
  commandPaletteOpen: boolean;
  settingsOpen: boolean;

  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setSettingsOpen: (open: boolean) => void;
}

export const useUIStore = create<UIStore>()((set) => ({
  commandPaletteOpen: false,
  settingsOpen: false,

  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  toggleCommandPalette: () =>
    set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
}));
