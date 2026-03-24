import React, { useMemo } from "react";
import { Sun, Moon } from "lucide-react";
import { useUsageStore } from "../../stores/usage-store";
import { useAnalyticsStore } from "../../stores/analytics-store";
import { useSettingsStore } from "../../stores/settings-store";
import type { SessionCostSummary } from "../../../shared/types/analytics";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStartMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function rateColor(
  status: "healthy" | "moderate" | "high" | "rate_limited",
): string {
  switch (status) {
    case "healthy":
      return "var(--success)";
    case "moderate":
      return "#fbbf24";
    case "high":
      return "var(--error)";
    case "rate_limited":
      return "#ef4444";
  }
}

function rateLabel(
  status: "healthy" | "moderate" | "high" | "rate_limited",
): string {
  switch (status) {
    case "healthy":
      return "healthy";
    case "moderate":
      return "moderate";
    case "high":
      return "high";
    case "rate_limited":
      return "rate-limited";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface StatusBarProps {
  projectCount?: number;
  isActive?: boolean;
}

const StatusBar: React.FC<StatusBarProps> = ({
  projectCount = 0,
  isActive = false,
}) => {
  const rateStatus = useUsageStore((s) => s.rateStatus);
  const sessionSummaries = useAnalyticsStore((s) => s.sessionSummaries);
  const theme = useSettingsStore((s) => s.theme);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);

  const activeModel = useMemo(() => {
    const windowStart = todayStartMs();
    let latestTime = 0;
    let model = "";
    for (const s of sessionSummaries as SessionCostSummary[]) {
      if (s.lastUpdateTime >= windowStart && s.lastUpdateTime > latestTime) {
        latestTime = s.lastUpdateTime;
        model = s.model ?? "";
      }
    }
    // Shorten model name: "claude-sonnet-4-6-20250514" → "sonnet-4.6"
    if (model.includes("opus")) return "opus";
    if (model.includes("sonnet")) return "sonnet";
    if (model.includes("haiku")) return "haiku";
    return model.length > 0 ? model.split("-").slice(0, 2).join("-") : "—";
  }, [sessionSummaries]);

  const monoStyle: React.CSSProperties = {
    fontFamily: "'Geist Mono', 'JetBrains Mono', monospace",
    fontSize: 11,
  };

  const dotColor = isActive ? "var(--success)" : "var(--text-dim)";

  return (
    <div
      className="flex items-center justify-between shrink-0 px-3 select-none"
      style={{
        height: 24,
        backgroundColor: "var(--bg-secondary)",
        borderTop: "1px solid var(--border-subtle)",
        transition: "background-color 0.2s ease",
        ...monoStyle,
      }}
    >
      {/* Left: model name */}
      <div className="flex items-center gap-2 min-w-0">
        <span style={{ color: "var(--text-secondary)" }}>{activeModel}</span>
        <span style={{ color: "var(--text-dim)" }} aria-hidden="true">
          ·
        </span>
      </div>

      {/* Center: rate status */}
      <div
        className="flex items-center gap-1.5"
        style={{ color: "var(--text-muted)" }}
        title="API rate status — healthy means normal, moderate means approaching limits"
      >
        <span
          className="inline-block rounded-full shrink-0"
          style={{
            width: 5,
            height: 5,
            backgroundColor: rateColor(rateStatus),
          }}
          aria-hidden="true"
        />
        <span
          style={{ color: rateColor(rateStatus) }}
          aria-label={`Rate: ${rateLabel(rateStatus)}`}
        >
          rate: {rateLabel(rateStatus)}
        </span>
      </div>

      {/* Right: theme toggle + session indicator + count */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="flex items-center justify-center rounded transition-colors"
          style={{
            width: 18,
            height: 18,
            color: "var(--text-muted)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--accent-primary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
          }}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun size={12} /> : <Moon size={12} />}
        </button>

        <span style={{ color: "var(--text-dim)" }} aria-hidden="true">
          ·
        </span>

        <span
          className="inline-block rounded-full shrink-0 transition-colors duration-500"
          style={{
            width: 6,
            height: 6,
            backgroundColor: dotColor,
          }}
          aria-label={isActive ? "Session active" : "Session idle"}
        />
        <span style={{ color: "var(--text-muted)" }}>
          {projectCount} {projectCount === 1 ? "project" : "projects"}
        </span>
      </div>
    </div>
  );
};

export default StatusBar;
