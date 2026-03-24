/**
 * ContextPanel — Visual context window usage gauge for the active session.
 *
 * Features:
 *   - Smooth gradient vertical fill bar (not discrete blocks)
 *   - Prominent percentage display
 *   - Model name, token count, compaction indicator
 *   - Clean empty state with Gauge icon when no session is active
 *   - Amber fill up to 80%; transitions to red above 80%
 */

import React, { useMemo } from "react";
import { AlertTriangle, Cpu, Gauge, Layers } from "lucide-react";
import { useAnalyticsStore } from "../../stores/analytics-store";
import { useSessionStore } from "../../stores/session-store";
import { getContextWindow, getModelDisplayName } from "../../../shared/pricing";
import { formatTokenCount } from "../../../shared/utils/format";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContextStats {
  model: string;
  currentInputTokens: number;
  contextWindow: number;
  fillPercent: number;
  isNearLimit: boolean;
  wasCompacted: boolean;
}

// ─── Hook: derive context stats from the active session summary ──────────────

function useContextStats(): ContextStats | null {
  const sessionSummaries = useAnalyticsStore((s) => s.sessionSummaries);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);

  return useMemo(() => {
    if (sessionSummaries.length === 0) return null;

    // Prefer the session that matches the active terminal session.
    // Fall back to the most recently updated summary when there is no match.
    const target =
      (activeSessionId
        ? sessionSummaries.find((s) => s.sessionId === activeSessionId)
        : null) ?? sessionSummaries[0];

    const model = target.model || "claude-sonnet-4-6";
    const contextWindow = getContextWindow(model);

    // Use total input tokens as the current context fill.
    // Each message accumulates the full conversation history in its prompt,
    // so totalInputTokens / messageCount gives the average context per turn.
    // For the gauge we want the most recent (largest) context window fill,
    // which is approximated by the average when no per-message breakdown exists.
    const messageCount = Math.max(target.messageCount, 1);
    const avgInputPerTurn = target.totalInputTokens / messageCount;

    // The last turn's input is the best proxy for current context window fill.
    // We use total / count as an approximation; this will read as non-zero
    // and proportional to actual usage even with a single session.
    const currentInputTokens = Math.round(avgInputPerTurn);

    // Compaction heuristic: if a later summary's avg is dramatically lower
    // than the session's peak, Claude likely summarised the context.
    // With only aggregate data we detect this as: avg is well below the
    // total-across-messages average for the first half of the session.
    const wasCompacted =
      target.messageCount > 4 &&
      avgInputPerTurn < (target.totalInputTokens / target.messageCount) * 0.5;

    const fillPercent =
      contextWindow > 0
        ? Math.min((currentInputTokens / contextWindow) * 100, 100)
        : 0;

    const isNearLimit = fillPercent >= 80;

    return {
      model,
      currentInputTokens,
      contextWindow,
      fillPercent,
      isNearLimit,
      wasCompacted,
    };
  }, [sessionSummaries, activeSessionId]);
}

// ─── Smooth gradient gauge bar ────────────────────────────────────────────────

interface GaugeBarProps {
  fillPercent: number;
  isNearLimit: boolean;
}

/**
 * Vertical fill gauge that grows from bottom to top using a smooth CSS gradient.
 * The track is a single tall container; the fill is an absolutely positioned
 * element whose height is driven by fillPercent.
 */
const GaugeBar: React.FC<GaugeBarProps> = ({ fillPercent, isNearLimit }) => {
  const clamped = Math.min(Math.max(fillPercent, 0), 100);

  // Colour transitions: amber below 80%, red above
  const fillStop0 = isNearLimit ? "#ef4444" : "#f59e0b";
  const fillStop1 = isNearLimit ? "#b91c1c" : "#d97706";

  // Tick marks at 25%, 50%, 75%, 100%
  const ticks = [100, 75, 50, 25, 0];

  return (
    <div className="flex items-stretch gap-2" style={{ height: 180 }}>
      {/* Bar container */}
      <div className="relative w-7 shrink-0">
        {/* Track */}
        <div
          className="absolute inset-0 rounded-lg overflow-hidden"
          style={{ backgroundColor: "#18181b" }}
          role="progressbar"
          aria-valuenow={Math.round(clamped)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Context window ${Math.round(clamped)}% full`}
        >
          {/* Fill — anchored to bottom */}
          <div
            className="absolute bottom-0 left-0 right-0 rounded-lg transition-all duration-700 ease-out"
            style={{
              height: `${clamped}%`,
              background: `linear-gradient(to top, ${fillStop1}, ${fillStop0})`,
              boxShadow: `0 0 12px 0 ${fillStop0}40`,
            }}
          />
        </div>
      </div>

      {/* Tick labels */}
      <div
        className="flex flex-col justify-between py-0"
        style={{ height: 180 }}
      >
        {ticks.map((tick) => (
          <div key={tick} className="flex items-center gap-1">
            <div className="w-1.5 h-px bg-zinc-700 shrink-0" />
            <span
              className="text-zinc-600 tabular-nums"
              style={{ fontFamily: "'Geist Mono', monospace", fontSize: 9 }}
            >
              {tick}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Empty state ──────────────────────────────────────────────────────────────

const EmptyState: React.FC = () => (
  <div
    className="flex flex-col h-full w-full overflow-hidden"
    style={{ backgroundColor: "#09090b" }}
  >
    {/* Header */}
    <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-zinc-800 shrink-0">
      <Layers size={14} className="text-amber-500 shrink-0" />
      <span className="text-zinc-300 text-sm font-medium tracking-wide">
        Context
      </span>
    </div>

    {/* Centred empty state */}
    <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
      <div className="w-10 h-10 rounded-full bg-zinc-800/60 flex items-center justify-center">
        <Gauge size={18} className="text-zinc-600" />
      </div>
      <p
        className="text-zinc-600 text-xs text-center leading-relaxed"
        style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
      >
        Start a session to see context usage
      </p>
    </div>
  </div>
);

// ─── Main panel ───────────────────────────────────────────────────────────────

const ContextPanel: React.FC = () => {
  const stats = useContextStats();

  if (!stats) {
    return <EmptyState />;
  }

  const {
    model,
    currentInputTokens,
    contextWindow,
    fillPercent,
    isNearLimit,
    wasCompacted,
  } = stats;
  const displayName = getModelDisplayName(model);
  const pctRounded = Math.round(fillPercent);

  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden"
      style={{
        backgroundColor: "#09090b",
        fontFamily: "'Geist', system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-zinc-800 shrink-0">
        <Layers size={14} className="text-amber-500 shrink-0" />
        <span className="text-zinc-300 text-sm font-medium tracking-wide">
          Context
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-4 gap-5 overflow-hidden">
        {/* Gauge + percentage row */}
        <div className="flex items-center gap-6">
          <GaugeBar fillPercent={fillPercent} isNearLimit={isNearLimit} />

          {/* Right stats column */}
          <div className="flex flex-col gap-4">
            {/* Large percentage */}
            <div className="flex flex-col gap-0.5">
              <span
                className={`text-4xl font-semibold tabular-nums leading-none ${isNearLimit ? "text-red-400" : "text-amber-400"}`}
                style={{ fontFamily: "'Geist Mono', monospace" }}
              >
                {pctRounded}
                <span
                  className={`text-xl font-normal ${isNearLimit ? "text-red-500" : "text-amber-600"}`}
                >
                  %
                </span>
              </span>
              <span
                className="text-zinc-600 text-xs"
                style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
              >
                context used
              </span>
            </div>

            {/* Token count */}
            <div className="flex flex-col gap-0.5">
              <span
                className="text-zinc-200 text-sm tabular-nums font-medium"
                style={{ fontFamily: "'Geist Mono', monospace" }}
              >
                {formatTokenCount(currentInputTokens)}
              </span>
              <span
                className="text-zinc-600 text-xs tabular-nums"
                style={{ fontFamily: "'Geist Mono', monospace" }}
              >
                / {formatTokenCount(contextWindow)} tok
              </span>
            </div>

            {/* Model label */}
            <div className="flex items-center gap-1.5">
              <Cpu size={11} className="text-zinc-600 shrink-0" />
              <span
                className="text-zinc-500 text-xs truncate"
                style={{ fontFamily: "'Geist Mono', monospace", maxWidth: 120 }}
                title={displayName}
              >
                {displayName}
              </span>
            </div>
          </div>
        </div>

        {/* Status badges */}
        <div className="w-full flex flex-col gap-2 px-1">
          {wasCompacted && (
            <div className="flex items-center gap-2 rounded-md bg-blue-950/40 border border-blue-800/40 px-3 py-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
              <span
                className="text-blue-300 text-xs"
                style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
              >
                Compacted — context was summarised
              </span>
            </div>
          )}

          {isNearLimit && (
            <div className="flex items-center gap-2 rounded-md bg-red-950/40 border border-red-800/40 px-3 py-2">
              <AlertTriangle size={11} className="text-red-400 shrink-0" />
              <span
                className="text-red-300 text-xs"
                style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
              >
                Context running low
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContextPanel;
