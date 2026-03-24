import React, { useEffect, useState } from "react";
import { useClaudeAPI } from "../../hooks/use-ipc";

function barColor(pct: number): string {
  if (pct >= 85) return "#f87171";
  if (pct >= 60) return "#fbbf24";
  return "#a78bfa";
}

function formatCountdown(resetsAt: string | null): string {
  if (!resetsAt) return "";
  const diff = new Date(resetsAt).getTime() - Date.now();
  if (diff <= 0) return "now";
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}d ${remHours}h`;
  }
  return `${hours}h ${minutes}m`;
}

export function UsageMeter(): React.ReactElement {
  const claude = useClaudeAPI();
  const [pct, setPct] = useState<number | null>(null);
  const [resetLabel, setResetLabel] = useState("");
  const [resetsAt, setResetsAt] = useState<string | null>(null);

  // Refresh countdown every 60s
  useEffect(() => {
    if (!resetsAt) return;
    setResetLabel(formatCountdown(resetsAt));
    const timer = setInterval(() => {
      setResetLabel(formatCountdown(resetsAt));
    }, 60_000);
    return () => clearInterval(timer);
  }, [resetsAt]);

  // Load usage on mount
  useEffect(() => {
    let cancelled = false;

    const loadUsage = async () => {
      // 1. Try OAuth (best source)
      try {
        const oauth = await claude.getOAuthUsage();
        if (!cancelled && oauth && oauth.fiveHour >= 0) {
          setPct(oauth.fiveHour);
          setResetsAt(oauth.fiveHourResetsAt);
          return;
        }
      } catch {
        /* fall through */
      }

      // 2. Try PTY-captured /usage data
      try {
        const data = await claude.getClaudeUsage();
        if (!cancelled && data && data.bars.length > 0) {
          const primary = data.bars[0]!;
          setPct(primary.percentUsed);
          setResetLabel(primary.resetTime.replace(/^Resets?\s*/i, ""));
          return;
        }
      } catch {
        /* fall through */
      }

      // 3. No data yet — trigger /usage on an active Claude session
      //    so the PTY parser captures it and pushes a live update.
      try {
        await claude.requestUsage();
      } catch {
        /* ignore */
      }

      // 4. Last resort — message count estimate
      try {
        const stats = await claude.getUsage();
        if (!cancelled && stats && stats.messagesUsed > 0) {
          setPct(stats.percentUsed);
        }
      } catch {
        /* ignore */
      }
    };

    void loadUsage();
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
          fiveHourResetsAt: string | null;
        };
        setPct(oauth.fiveHour);
        setResetsAt(oauth.fiveHourResetsAt);
        return;
      }

      if (d["bars"] && Array.isArray(d["bars"]) && d["bars"].length > 0) {
        const primary = d["bars"][0] as {
          percentUsed: number;
          resetTime: string;
        };
        setPct(primary.percentUsed);
        setResetLabel(primary.resetTime.replace(/^Resets?\s*/i, ""));
      }
    });
    return unsub;
  }, [claude]);

  if (pct === null) {
    return (
      <div
        className="flex items-center gap-1.5 shrink-0 text-stone-600"
        style={{
          width: 100,
          fontSize: 10,
          fontFamily: "'Geist Mono', monospace",
        }}
      >
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-stone-700" />
        <span>loading...</span>
      </div>
    );
  }

  const color = barColor(pct);

  return (
    <div
      className="flex items-center gap-2 shrink-0"
      style={{ width: 160 }}
      title={`${pct}% used${resetLabel ? ` · Resets in ${resetLabel}` : ""}`}
    >
      <div
        className="flex-1 rounded-full overflow-hidden"
        style={{ height: 4, backgroundColor: "var(--bg-surface)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.8 }}
        />
      </div>
      <span
        className="font-mono leading-none shrink-0"
        style={{ fontSize: 10, color }}
      >
        {pct}%
      </span>
      {resetLabel && (
        <span
          className="font-mono leading-none shrink-0 text-stone-500 truncate"
          style={{ fontSize: 9, maxWidth: 55 }}
        >
          {resetLabel}
        </span>
      )}
    </div>
  );
}
