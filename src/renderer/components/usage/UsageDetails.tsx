import React, { useEffect, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { useClaudeAPI } from "../../hooks/use-ipc";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UsageBar {
  label: string;
  percentUsed: number;
  resetsAt: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function barColor(pct: number): string {
  if (pct >= 85) return "#f87171";
  if (pct >= 60) return "#fbbf24";
  return "#a78bfa";
}

function formatCountdown(resetsAt: string | null): string {
  if (!resetsAt) return "";
  const diff = new Date(resetsAt).getTime() - Date.now();
  if (diff <= 0) return "Resets now";
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `Resets in ${days}d ${remHours}h`;
  }
  return `Resets in ${hours}h ${minutes}m`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function UsageDetails(): React.ReactElement {
  const claude = useClaudeAPI();
  const [bars, setBars] = useState<UsageBar[]>([]);
  const [status, setStatus] = useState<
    "idle" | "requesting" | "loaded" | "no-session"
  >("idle");
  const [, setTick] = useState(0); // Force re-render for countdown updates

  // Update countdown every 60s
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Load on mount
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const oauth = await claude.getOAuthUsage();
        if (!cancelled && oauth) {
          setBars([
            {
              label: "5-hour window",
              percentUsed: oauth.fiveHour,
              resetsAt: oauth.fiveHourResetsAt,
            },
            {
              label: "7-day window",
              percentUsed: oauth.sevenDay,
              resetsAt: oauth.sevenDayResetsAt,
            },
          ]);
          setStatus("loaded");
          return;
        }
      } catch {
        /* fall through */
      }

      try {
        const data = await claude.getClaudeUsage();
        if (!cancelled && data && data.bars.length > 0) {
          setBars(
            data.bars.map((b) => ({
              label: b.label,
              percentUsed: b.percentUsed,
              resetsAt: null,
            })),
          );
          setStatus("loaded");
          return;
        }
      } catch {
        /* fall through */
      }

      try {
        const stats = await claude.getUsage();
        if (!cancelled && stats && stats.messagesUsed > 0) {
          setBars([
            {
              label: "Today's messages",
              percentUsed: stats.percentUsed,
              resetsAt: null,
            },
          ]);
          setStatus("loaded");
        }
      } catch {
        /* ignore */
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [claude]);

  // Live updates
  useEffect(() => {
    const unsub = claude.onUsageUpdated((data: unknown) => {
      const d = data as Record<string, unknown> | null;
      if (!d) return;

      if (d["source"] === "oauth" && d["oauth"]) {
        const oauth = d["oauth"] as {
          fiveHour: number;
          sevenDay: number;
          fiveHourResetsAt: string | null;
          sevenDayResetsAt: string | null;
        };
        setBars([
          {
            label: "5-hour window",
            percentUsed: oauth.fiveHour,
            resetsAt: oauth.fiveHourResetsAt,
          },
          {
            label: "7-day window",
            percentUsed: oauth.sevenDay,
            resetsAt: oauth.sevenDayResetsAt,
          },
        ]);
        setStatus("loaded");
        return;
      }

      if (d["bars"] && Array.isArray(d["bars"]) && d["bars"].length > 0) {
        setBars(
          (d["bars"] as Array<{ label: string; percentUsed: number }>).map(
            (b) => ({ ...b, resetsAt: null }),
          ),
        );
        setStatus("loaded");
      }
    });
    return unsub;
  }, [claude]);

  const handleRefresh = useCallback(async () => {
    setStatus("requesting");
    try {
      const oauth = await claude.getOAuthUsage();
      if (oauth) {
        setBars([
          {
            label: "5-hour window",
            percentUsed: oauth.fiveHour,
            resetsAt: oauth.fiveHourResetsAt,
          },
          {
            label: "7-day window",
            percentUsed: oauth.sevenDay,
            resetsAt: oauth.sevenDayResetsAt,
          },
        ]);
        setStatus("loaded");
        return;
      }
      const result = await claude.requestUsage();
      if (result.sent) {
        setStatus("requesting");
        setTimeout(() => {
          setStatus((prev) => (prev === "requesting" ? "loaded" : prev));
        }, 10_000);
      } else {
        setStatus("no-session");
      }
    } catch {
      setStatus("idle");
    }
  }, [claude]);

  return (
    <div className="flex flex-col gap-2 px-2 py-2 w-full">
      <div className="flex items-center justify-between">
        <span
          className="text-stone-500 uppercase tracking-widest font-medium"
          style={{ fontSize: 10, fontFamily: "'Geist Mono', monospace" }}
        >
          Usage
        </span>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={status === "requesting"}
          className="text-stone-600 hover:text-stone-400 transition-colors disabled:opacity-30"
          title="Refresh usage data"
          aria-label="Refresh usage"
        >
          <RefreshCw
            size={10}
            className={status === "requesting" ? "animate-spin" : ""}
          />
        </button>
      </div>

      {bars.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {bars.map((bar, i) => (
            <UsageBarRow key={i} bar={bar} />
          ))}
        </div>
      ) : status === "requesting" ? (
        <div className="flex items-center gap-2 py-1">
          <div className="w-3 h-3 rounded-full border border-stone-600 border-t-transparent animate-spin" />
          <span
            className="text-stone-500"
            style={{ fontSize: 10, fontFamily: "'Geist Mono', monospace" }}
          >
            Fetching...
          </span>
        </div>
      ) : (
        <span
          className="text-stone-500 text-[10px]"
          style={{ fontFamily: "'Geist Mono', monospace" }}
        >
          Connecting...
        </span>
      )}
    </div>
  );
}

// ─── Single usage bar ─────────────────────────────────────────────────────────

const UsageBarRow: React.FC<{ bar: UsageBar }> = ({ bar }) => {
  const pct = Math.min(100, Math.max(0, bar.percentUsed));
  const color = barColor(pct);
  const countdown = formatCountdown(bar.resetsAt);

  return (
    <div className="flex flex-col gap-0.5">
      {/* Countdown + percentage — prominent */}
      <div className="flex items-center justify-between">
        {countdown ? (
          <span
            className="text-stone-300 font-medium leading-snug"
            style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace" }}
          >
            {countdown}
          </span>
        ) : (
          <span />
        )}
        <span
          className="shrink-0 text-stone-200 font-medium"
          style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace" }}
        >
          {pct}%
        </span>
      </div>

      <div
        className="w-full rounded-sm overflow-hidden"
        style={{ height: 6, backgroundColor: "var(--bg-surface)" }}
      >
        <div
          className="h-full rounded-sm transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.8 }}
        />
      </div>

      {/* Label — subdued */}
      <span
        className="text-stone-500 leading-snug"
        style={{ fontSize: 9, fontFamily: "'Geist Mono', monospace" }}
      >
        {bar.label}
      </span>
    </div>
  );
};
