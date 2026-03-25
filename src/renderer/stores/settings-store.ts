import { create } from "zustand";
import { persist } from "zustand/middleware";

export type BillingMode = "subscription" | "api";
export type AppTheme = "dark" | "light";

interface SettingsStore {
  fontSize: number;
  fontFamily: string;
  budgetThreshold: number;
  showCostInStatusBar: boolean;
  billingMode: BillingMode;
  theme: AppTheme;

  setFontSize: (size: number) => void;
  setFontFamily: (family: string) => void;
  setBudgetThreshold: (threshold: number) => void;
  setShowCostInStatusBar: (show: boolean) => void;
  setBillingMode: (mode: BillingMode) => void;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      fontSize: 14,
      fontFamily:
        "'Geist Mono', 'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
      budgetThreshold: 10,
      showCostInStatusBar: true,
      billingMode: "subscription",
      theme: "dark",

      setFontSize: (fontSize) => set({ fontSize }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setBudgetThreshold: (budgetThreshold) => set({ budgetThreshold }),
      setShowCostInStatusBar: (showCostInStatusBar) =>
        set({ showCostInStatusBar }),
      setBillingMode: (billingMode) => set({ billingMode }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
    }),
    {
      name: "gilfoyle:settings",
    },
  ),
);
