import React, { useEffect, useCallback } from "react";
import { X, Settings } from "lucide-react";
import { useUIStore } from "../../stores/ui-store";
import {
  useSettingsStore,
  type BillingMode,
  type PlanTier,
  type AppTheme,
} from "../../stores/settings-store";

// ─── Option row ───────────────────────────────────────────────────────────────

interface OptionRowProps {
  label: string;
  description: string;
  children: React.ReactNode;
}

const OptionRow: React.FC<OptionRowProps> = ({
  label,
  description,
  children,
}) => (
  <div
    className="flex items-center justify-between gap-4 py-3"
    style={{ borderBottom: "1px solid var(--border-subtle)" }}
  >
    <div className="flex flex-col gap-0.5 min-w-0">
      <span
        className="text-xs font-medium"
        style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          color: "var(--text-primary)",
        }}
      >
        {label}
      </span>
      <span
        className="text-[10px] leading-snug"
        style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          color: "var(--text-muted)",
        }}
      >
        {description}
      </span>
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

// ─── Select dropdown ──────────────────────────────────────────────────────────

interface SelectProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

function Select<T extends string>({
  value,
  options,
  onChange,
}: SelectProps<T>): React.ReactElement {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="rounded px-2 py-1 text-xs outline-none"
      style={{
        fontFamily: "'Geist Mono', monospace",
        fontSize: 11,
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
        color: "var(--text-primary)",
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

const SettingsPanel: React.FC = () => {
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const billingMode = useSettingsStore((s) => s.billingMode);
  const setBillingMode = useSettingsStore((s) => s.setBillingMode);
  const planTier = useSettingsStore((s) => s.planTier);
  const setPlanTier = useSettingsStore((s) => s.setPlanTier);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const setFontSize = useSettingsStore((s) => s.setFontSize);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  // Close on Escape
  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [settingsOpen, setSettingsOpen]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) setSettingsOpen(false);
    },
    [setSettingsOpen],
  );

  if (!settingsOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backgroundColor: "var(--backdrop)",
        backdropFilter: "blur(4px)",
      }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div
        className="flex flex-col w-full max-w-md rounded-xl overflow-hidden"
        style={{
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          maxHeight: "75vh",
          boxShadow: "var(--shadow-dialog)",
          transition: "background-color 0.2s ease",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-3 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <Settings size={15} style={{ color: "var(--accent-primary)" }} className="shrink-0" />
          <span
            className="font-semibold flex-1"
            style={{
              fontSize: 14,
              fontFamily: "'Geist', system-ui, sans-serif",
              color: "var(--text-primary)",
            }}
          >
            Settings
          </span>
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            className="flex items-center justify-center w-6 h-6 rounded transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
            }}
            aria-label="Close settings"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          <OptionRow
            label="Theme"
            description="Switch between dark and light mode."
          >
            <Select<AppTheme>
              value={theme}
              options={[
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light" },
              ]}
              onChange={setTheme}
            />
          </OptionRow>

          <OptionRow
            label="Billing Mode"
            description="How you pay for Claude. Affects usage display."
          >
            <Select<BillingMode>
              value={billingMode}
              options={[
                { value: "auto", label: "Auto-detect" },
                { value: "subscription", label: "Subscription" },
                { value: "api", label: "API" },
              ]}
              onChange={setBillingMode}
            />
          </OptionRow>

          {(billingMode === "subscription" || billingMode === "auto") && (
            <OptionRow
              label="Plan Tier"
              description="Your Claude subscription tier. Affects message limit."
            >
              <Select<PlanTier>
                value={planTier}
                options={[
                  { value: "auto", label: "Auto-detect" },
                  { value: "pro", label: "Pro (100/day)" },
                  { value: "max", label: "Max (500/day)" },
                ]}
                onChange={setPlanTier}
              />
            </OptionRow>
          )}

          <OptionRow
            label="Terminal Font Size"
            description="Font size for the terminal emulator."
          >
            <Select<string>
              value={String(fontSize)}
              options={[
                { value: "12", label: "12px" },
                { value: "13", label: "13px" },
                { value: "14", label: "14px" },
                { value: "15", label: "15px" },
                { value: "16", label: "16px" },
              ]}
              onChange={(v) => setFontSize(Number(v))}
            />
          </OptionRow>
        </div>

        {/* Footer */}
        <div
          className="shrink-0 flex items-center justify-end px-4 py-2"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <span
            className="text-[10px]"
            style={{
              fontFamily: "'Geist Mono', monospace",
              color: "var(--text-dim)",
            }}
          >
            ESC to close
          </span>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
