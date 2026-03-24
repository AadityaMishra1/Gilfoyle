/**
 * AnalyticsPanel — Bloomberg-style analytics dashboard with dual-mode support.
 *
 * Layout (top to bottom):
 *   1. Header with mode toggle: "Subscription" | "API" pill tabs
 *   2. Subscription view: session activity cards, rate status, duration, usage bar
 *   3. API view: token summary cards, 7-day cost chart, session table
 */

import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  BarChart2,
  Activity,
  Zap,
  Clock,
  Database,
  DollarSign,
  MessageSquare,
  Wrench,
} from "lucide-react";
import { useAnalyticsStore } from "../../stores/analytics-store";
import { getModelDisplayName } from "../../../shared/pricing";
import {
  formatTokenCount,
  formatCost,
  formatDuration,
} from "../../../shared/utils/format";
import type { SessionCostSummary } from "../../../shared/types/analytics";

// ─── Window API type ─────────────────────────────────────────────────────────

type ClaudeWindow = Window & {
  claude?: {
    getAnalytics?: () => Promise<SessionCostSummary[]>;
    getTodayCost?: () => Promise<number>;
    onAnalyticsUpdated?: (
      cb: (summaries: SessionCostSummary[]) => void,
    ) => () => void;
  };
};

// ─── Mode toggle ──────────────────────────────────────────────────────────────

type UsageMode = "subscription" | "api";

interface ModeToggleProps {
  mode: UsageMode;
  onChange: (mode: UsageMode) => void;
}

const ModeToggle: React.FC<ModeToggleProps> = ({ mode, onChange }) => (
  <div className="flex items-center rounded-full bg-zinc-800 p-0.5 gap-0.5 shrink-0">
    {(["subscription", "api"] as UsageMode[]).map((m) => (
      <button
        key={m}
        onClick={() => onChange(m)}
        className={[
          "px-2.5 py-1 rounded-full text-xs font-medium transition-colors leading-none",
          mode === m
            ? "bg-amber-500 text-zinc-950"
            : "text-zinc-500 hover:text-zinc-300",
        ].join(" ")}
        style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
      >
        {m === "subscription" ? "Subscription" : "API"}
      </button>
    ))}
  </div>
);

// ─── Shared summary card ──────────────────────────────────────────────────────

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({
  icon,
  label,
  value,
  accent,
}) => (
  <div className="flex-1 min-w-0 rounded-md bg-zinc-800/60 px-3 py-2.5 flex flex-col gap-1.5">
    <div className="flex items-center gap-1.5">
      <span className="text-zinc-600 shrink-0">{icon}</span>
      <span
        className="text-zinc-500 text-xs tracking-wide truncate"
        style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
      >
        {label}
      </span>
    </div>
    <span
      className={`text-lg leading-tight font-medium tabular-nums ${accent ? "text-amber-400" : "text-zinc-100"}`}
      style={{ fontFamily: "'Geist Mono', monospace" }}
    >
      {value}
    </span>
  </div>
);

// ─── Rate status indicator ────────────────────────────────────────────────────

type RateLevel = "healthy" | "moderate" | "high";

interface RateStatusProps {
  level: RateLevel;
  messageCount: number;
}

const RATE_CONFIG: Record<
  RateLevel,
  { color: string; bg: string; border: string; label: string; dot: string }
> = {
  healthy: {
    color: "text-emerald-400",
    bg: "bg-emerald-950/40",
    border: "border-emerald-800/40",
    label: "Healthy",
    dot: "bg-emerald-400",
  },
  moderate: {
    color: "text-amber-400",
    bg: "bg-amber-950/40",
    border: "border-amber-800/40",
    label: "Moderate",
    dot: "bg-amber-400",
  },
  high: {
    color: "text-red-400",
    bg: "bg-red-950/40",
    border: "border-red-800/40",
    label: "Near limit",
    dot: "bg-red-400",
  },
};

const RateStatus: React.FC<RateStatusProps> = ({ level, messageCount }) => {
  const cfg = RATE_CONFIG[level];
  return (
    <div
      className={`flex items-center justify-between rounded-md ${cfg.bg} border ${cfg.border} px-3 py-2.5`}
    >
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${cfg.dot} shrink-0`} />
        <span
          className={`text-xs font-medium ${cfg.color}`}
          style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
        >
          Rate Status
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`text-xs tabular-nums ${cfg.color}`}
          style={{ fontFamily: "'Geist Mono', monospace" }}
        >
          {cfg.label}
        </span>
        <span
          className="text-zinc-600 text-xs tabular-nums"
          style={{ fontFamily: "'Geist Mono', monospace" }}
        >
          {messageCount} msg
        </span>
      </div>
    </div>
  );
};

// ─── Session usage bar ────────────────────────────────────────────────────────

interface UsageBarProps {
  label: string;
  value: number;
  max: number;
  color?: string;
}

const UsageBar: React.FC<UsageBarProps> = ({
  label,
  value,
  max,
  color = "#f59e0b",
}) => {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span
          className="text-zinc-500 text-xs"
          style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
        >
          {label}
        </span>
        <span
          className="text-zinc-300 text-xs tabular-nums"
          style={{ fontFamily: "'Geist Mono', monospace" }}
        >
          {value.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
};

// ─── Elapsed timer hook ───────────────────────────────────────────────────────

function useElapsedTime(startTime: number | null): string {
  const [elapsed, setElapsed] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!startTime) return;

    const tick = () => {
      setElapsed(Date.now() - startTime);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [startTime]);

  return formatDuration(elapsed);
}

// ─── Subscription view ────────────────────────────────────────────────────────

interface SubscriptionViewProps {
  sessionSummaries: SessionCostSummary[];
}

const SubscriptionView: React.FC<SubscriptionViewProps> = ({
  sessionSummaries,
}) => {
  const totals = useMemo(() => {
    return sessionSummaries.reduce(
      (acc, s) => ({
        messageCount: acc.messageCount + s.messageCount,
        totalInputTokens: acc.totalInputTokens + s.totalInputTokens,
        totalOutputTokens: acc.totalOutputTokens + s.totalOutputTokens,
      }),
      { messageCount: 0, totalInputTokens: 0, totalOutputTokens: 0 },
    );
  }, [sessionSummaries]);

  // Sessions count — each summary represents one session with data.
  const sessionCount = sessionSummaries.length;

  // Approximate tool calls: sessions typically average ~3 tool calls per message.
  const approxToolCalls =
    totals.messageCount > 0 ? Math.round(totals.messageCount * 3) : 0;

  // Duration from earliest session start to now.
  const earliestStart = useMemo(() => {
    if (sessionSummaries.length === 0) return null;
    return Math.min(...sessionSummaries.map((s) => s.startTime));
  }, [sessionSummaries]);

  const elapsedLabel = useElapsedTime(earliestStart);

  // Rate level based on how recently data was updated.
  const rateLevel: RateLevel = useMemo(() => {
    if (sessionSummaries.length === 0) return "healthy";
    const latestUpdate = Math.max(
      ...sessionSummaries.map((s) => s.lastUpdateTime),
    );
    const minutesSince = (Date.now() - latestUpdate) / 60_000;
    if (minutesSince < 5) return "healthy";
    if (minutesSince < 30) return "moderate";
    return "high";
  }, [sessionSummaries]);

  // Approximate usage maximums for visual bar scaling.
  const SESSION_SOFT_LIMIT = 20;
  const TOKEN_SOFT_LIMIT = 500_000;

  if (sessionSummaries.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
        <div
          className="w-8 h-8 rounded-full bg-zinc-800/60 flex items-center justify-center"
          aria-hidden="true"
        >
          <BarChart2 size={16} className="text-zinc-600" />
        </div>
        <p
          className="text-zinc-600 text-xs text-center leading-relaxed"
          style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
        >
          Start a Claude Code session to see activity
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-3 overflow-y-auto px-4 py-3 min-h-0">
      {/* Activity cards */}
      <div className="flex gap-2 shrink-0">
        <MetricCard
          icon={<MessageSquare size={12} />}
          label="Sessions"
          value={sessionCount.toString()}
        />
        <MetricCard
          icon={<Wrench size={12} />}
          label="Tool Calls"
          value={approxToolCalls > 0 ? `~${approxToolCalls}` : "—"}
        />
        <MetricCard
          icon={<Clock size={12} />}
          label="Duration"
          value={earliestStart ? elapsedLabel : "—"}
        />
      </div>

      {/* Rate status */}
      <div className="shrink-0">
        <RateStatus level={rateLevel} messageCount={totals.messageCount} />
      </div>

      {/* Usage bars */}
      <div className="shrink-0 rounded-md bg-zinc-800/60 px-3 py-3 flex flex-col gap-3">
        <span
          className="text-zinc-500 text-xs tracking-wide"
          style={{ fontFamily: "'Geist Mono', monospace" }}
        >
          Session usage
        </span>
        <UsageBar
          label="Sessions"
          value={sessionCount}
          max={SESSION_SOFT_LIMIT}
          color="#f59e0b"
        />
        <UsageBar
          label="Input tokens"
          value={totals.totalInputTokens}
          max={TOKEN_SOFT_LIMIT}
          color="#6366f1"
        />
        <UsageBar
          label="Output tokens"
          value={totals.totalOutputTokens}
          max={Math.round(TOKEN_SOFT_LIMIT * 0.4)}
          color="#10b981"
        />
      </div>

      {/* Disclaimer */}
      <div className="shrink-0 rounded-md bg-zinc-900 border border-zinc-800/60 px-3 py-2.5">
        <p
          className="text-zinc-600 text-xs leading-relaxed"
          style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
        >
          Exact usage limits are managed by your Claude subscription. Bars above
          show approximate activity — not official plan limits.
        </p>
      </div>
    </div>
  );
};

// ─── Chart tooltip ────────────────────────────────────────────────────────────

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

const ChartTooltip: React.FC<ChartTooltipProps> = ({
  active,
  payload,
  label,
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2 shadow-xl"
      style={{ fontFamily: "'Geist Mono', monospace" }}
    >
      <p className="text-zinc-500 text-xs mb-0.5">{label}</p>
      <p className="text-amber-400 text-sm font-medium">
        {formatCost(payload[0].value)}
      </p>
    </div>
  );
};

// ─── Model badge ──────────────────────────────────────────────────────────────

const ModelBadge: React.FC<{ model: string }> = ({ model }) => {
  const display = getModelDisplayName(model);
  const short = display.replace(/^Claude\s+/i, "").split(" ")[0];
  const colorClass = short.toLowerCase().startsWith("opus")
    ? "bg-purple-950/60 text-purple-300 border-purple-800/50"
    : short.toLowerCase().startsWith("haiku")
      ? "bg-emerald-950/60 text-emerald-300 border-emerald-800/50"
      : "bg-amber-950/60 text-amber-300 border-amber-800/50";

  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs border ${colorClass}`}
      style={{ fontFamily: "'Geist Mono', monospace" }}
    >
      {short}
    </span>
  );
};

// ─── Session row ──────────────────────────────────────────────────────────────

interface SessionRowProps {
  session: SessionCostSummary;
}

const SessionRow: React.FC<SessionRowProps> = React.memo(({ session }) => {
  const totalTokens = session.totalInputTokens + session.totalOutputTokens;
  const shortId = session.sessionId.slice(0, 8);

  return (
    <div
      className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-3 py-2 border-b border-zinc-800/40 hover:bg-zinc-800/30 transition-colors"
      style={{ fontFamily: "'Geist Mono', monospace" }}
    >
      <span
        className="text-zinc-400 text-xs truncate"
        title={session.sessionId}
      >
        {shortId}&hellip;
      </span>
      <span className="flex items-center">
        <ModelBadge model={session.model} />
      </span>
      <span className="text-zinc-500 text-xs tabular-nums text-right self-center">
        {formatTokenCount(totalTokens)}
      </span>
      <span className="text-amber-400 text-xs tabular-nums text-right self-center">
        {formatCost(session.totalCostUSD)}
      </span>
    </div>
  );
});

SessionRow.displayName = "SessionRow";

// ─── API view ─────────────────────────────────────────────────────────────────

interface ApiViewProps {
  sessionSummaries: SessionCostSummary[];
  todayCost: number;
  overBudget: boolean;
}

const ApiView: React.FC<ApiViewProps> = ({
  sessionSummaries,
  todayCost,
  overBudget,
}) => {
  const dailyRollups = useAnalyticsStore((s) => s.dailyRollups);

  const totals = useMemo(() => {
    return sessionSummaries.reduce(
      (acc, s) => ({
        inputTokens: acc.inputTokens + s.totalInputTokens,
        outputTokens: acc.outputTokens + s.totalOutputTokens,
        cacheReadTokens: acc.cacheReadTokens + s.totalCacheReadTokens,
        totalCost: acc.totalCost + s.totalCostUSD,
      }),
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, totalCost: 0 },
    );
  }, [sessionSummaries]);

  const chartData = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
      const key = [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, "0"),
        String(d.getDate()).padStart(2, "0"),
      ].join("-");
      const label = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const rollup = dailyRollups.find((r) => r.date === key);
      return { date: key, label, cost: rollup?.totalCostUSD ?? 0 };
    });
  }, [dailyRollups]);

  const gradientId = "analytics-cost-gradient";

  return (
    <div className="flex-1 flex flex-col gap-3 overflow-y-auto px-4 py-3 min-h-0">
      {/* Over-budget indicator */}
      {overBudget && (
        <div className="shrink-0 rounded-md bg-red-950/40 border border-red-800/40 px-3 py-2 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
          <span
            className="text-red-300 text-xs"
            style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
          >
            Daily budget exceeded — {formatCost(todayCost)} spent today
          </span>
        </div>
      )}

      {/* Token summary cards */}
      <div className="flex gap-2 shrink-0">
        <MetricCard
          icon={<Zap size={12} />}
          label="Input"
          value={formatTokenCount(totals.inputTokens)}
        />
        <MetricCard
          icon={<Activity size={12} />}
          label="Output"
          value={formatTokenCount(totals.outputTokens)}
        />
        <MetricCard
          icon={<Database size={12} />}
          label="Cache"
          value={formatTokenCount(totals.cacheReadTokens)}
        />
        <MetricCard
          icon={<DollarSign size={12} />}
          label="Total"
          value={formatCost(totals.totalCost)}
          accent
        />
      </div>

      {/* 7-day chart */}
      <div className="shrink-0 rounded-md bg-zinc-900 border border-zinc-800/60 px-3 pt-3 pb-2">
        <p
          className="text-zinc-600 text-xs mb-3 tracking-wide"
          style={{ fontFamily: "'Geist Mono', monospace" }}
        >
          7-day cost
        </p>
        <div style={{ height: 88 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 4, right: 2, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{
                  fill: "#3f3f46",
                  fontSize: 10,
                  fontFamily: "'Geist Mono', monospace",
                }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{
                  stroke: "#3f3f46",
                  strokeWidth: 1,
                  strokeDasharray: "3 3",
                }}
              />
              <Area
                type="monotone"
                dataKey="cost"
                stroke="#f59e0b"
                strokeWidth={1.5}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{
                  r: 3,
                  fill: "#f59e0b",
                  stroke: "#09090b",
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Session table */}
      <div className="flex-1 flex flex-col min-h-0 rounded-md bg-zinc-900 border border-zinc-800/60 overflow-hidden">
        <div
          className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-3 py-2 border-b border-zinc-800/60 shrink-0"
          style={{ fontFamily: "'Geist Mono', monospace" }}
        >
          <span className="text-zinc-700 text-xs uppercase tracking-wider">
            Session
          </span>
          <span className="text-zinc-700 text-xs uppercase tracking-wider">
            Model
          </span>
          <span className="text-zinc-700 text-xs uppercase tracking-wider text-right">
            Tokens
          </span>
          <span className="text-zinc-700 text-xs uppercase tracking-wider text-right">
            Cost
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessionSummaries.length === 0 ? (
            <div className="flex items-center justify-center h-20">
              <span
                className="text-zinc-700 text-xs"
                style={{ fontFamily: "'Geist Mono', monospace" }}
              >
                No sessions recorded yet
              </span>
            </div>
          ) : (
            sessionSummaries.map((session) => (
              <SessionRow key={session.sessionId} session={session} />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Main panel ───────────────────────────────────────────────────────────────

const AnalyticsPanel: React.FC = () => {
  const [mode, setMode] = useState<UsageMode>("subscription");

  const sessionSummaries = useAnalyticsStore((s) => s.sessionSummaries);
  const todayCost = useAnalyticsStore((s) => s.todayCost);
  const budgetThreshold = useAnalyticsStore((s) => s.budgetThreshold);
  const setSessionSummaries = useAnalyticsStore((s) => s.setSessionSummaries);
  const setTodayCost = useAnalyticsStore((s) => s.setTodayCost);

  // Fetch analytics on mount and subscribe to live updates.
  useEffect(() => {
    const win = window as ClaudeWindow;
    if (!win.claude) return;

    // Initial fetch.
    win.claude.getAnalytics?.().then((summaries) => {
      setSessionSummaries(summaries ?? []);
    });
    win.claude.getTodayCost?.().then((cost) => {
      setTodayCost(cost ?? 0);
    });

    // Live subscription — returns unsubscribe fn.
    const unsub = win.claude.onAnalyticsUpdated?.((summaries) => {
      setSessionSummaries(summaries ?? []);
    });
    return () => unsub?.();
  }, [setSessionSummaries, setTodayCost]);

  const overBudget = todayCost >= budgetThreshold;

  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden"
      style={{
        backgroundColor: "#09090b",
        fontFamily: "'Geist', system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2.5 border-b border-zinc-800 shrink-0 gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <BarChart2 size={14} className="text-amber-500 shrink-0" />
          <span className="text-zinc-300 text-sm font-medium tracking-wide">
            Analytics
          </span>
        </div>
        <ModeToggle mode={mode} onChange={setMode} />
        {mode === "api" && (
          <span
            className={`text-xl font-semibold tabular-nums leading-none shrink-0 ${overBudget ? "text-red-400" : "text-amber-400"}`}
            style={{ fontFamily: "'Geist Mono', monospace" }}
          >
            {formatCost(todayCost)}
          </span>
        )}
      </div>

      {/* Body */}
      {mode === "subscription" ? (
        <SubscriptionView sessionSummaries={sessionSummaries} />
      ) : (
        <ApiView
          sessionSummaries={sessionSummaries}
          todayCost={todayCost}
          overBudget={overBudget}
        />
      )}
    </div>
  );
};

export default AnalyticsPanel;
