/**
 * useDataLoader — runs once at app startup to populate all Zustand stores
 * from the main process via IPC, and subscribes to push-update events so the
 * stores stay in sync as data changes.
 *
 * All new API methods are called with optional chaining so the hook degrades
 * gracefully if the preload script hasn't been updated yet — the window.claude
 * object is cast to a wider type that marks everything as optional so TypeScript
 * is satisfied while the runtime check is safe.
 */

import { useEffect } from "react";
import { useClaudeAPI } from "./use-ipc";
import { useSessionStore } from "../stores/session-store";
import { useAnalyticsStore } from "../stores/analytics-store";
import { useMCPStore } from "../stores/mcp-store";
import { useUsageStore } from "../stores/usage-store";
import type { SessionMeta } from "../../shared/types/session";
import type { SessionCostSummary } from "../../shared/types/analytics";
import type { MCPServerStatus } from "../../shared/types/mcp";
import type { UsageStats } from "../../main/services/usage-tracker";

// ─── Loose API type ───────────────────────────────────────────────────────────
// Represents the current + upcoming preload surface with everything optional.
// This lets us call methods safely even if the preload hasn't been updated yet.
// The future onAnalyticsUpdated signature passes { summaries, todayCost } as
// a single object — different from the current scalar summaries array form.

interface LooseClaudeAPI {
  scanSessions?: () => Promise<SessionMeta[]>;
  getAnalytics?: () => Promise<SessionCostSummary[]>;
  getTodayCost?: () => Promise<number>;
  getMcpStatus?: () => Promise<MCPServerStatus[]>;
  getUsage?: () => Promise<UsageStats>;
  onSessionsUpdated?: (cb: (sessions: SessionMeta[]) => void) => () => void;
  onAnalyticsUpdated?: (
    cb: (data: { summaries: SessionCostSummary[]; todayCost: number }) => void,
  ) => () => void;
  onUsageUpdated?: (cb: (stats: UsageStats) => void) => () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDataLoader(): void {
  // useClaudeAPI returns ClaudeAPI; we cast via unknown so we can overlay the
  // looser optional shape without TypeScript complaining about incompatibility.
  const claude = useClaudeAPI() as unknown as LooseClaudeAPI;

  useEffect(() => {
    // ── Initial data loads ──────────────────────────────────────────────────

    claude
      .scanSessions?.()
      .then((sessions) => {
        useSessionStore.getState().setSessions(sessions);
      })
      .catch((err: unknown) => {
        console.warn("[useDataLoader] scanSessions failed:", err);
      });

    claude
      .getAnalytics?.()
      .then((summaries) => {
        useAnalyticsStore.getState().setSessionSummaries(summaries);
      })
      .catch((err: unknown) => {
        console.warn("[useDataLoader] getAnalytics failed:", err);
      });

    claude
      .getTodayCost?.()
      .then((cost) => {
        useAnalyticsStore.getState().setTodayCost(cost);
      })
      .catch((err: unknown) => {
        console.warn("[useDataLoader] getTodayCost failed:", err);
      });

    claude
      .getMcpStatus?.()
      .then((servers) => {
        useMCPStore.getState().setServers(servers);
      })
      .catch((err: unknown) => {
        console.warn("[useDataLoader] getMcpStatus failed:", err);
      });

    claude
      .getUsage?.()
      .then((stats) => {
        useUsageStore.getState().setUsageStats(stats);
      })
      .catch((err: unknown) => {
        console.warn("[useDataLoader] getUsage failed:", err);
      });

    // ── Push-update subscriptions ───────────────────────────────────────────

    const unsubs: Array<() => void> = [];

    if (claude.onSessionsUpdated) {
      unsubs.push(
        claude.onSessionsUpdated((sessions) => {
          useSessionStore.getState().setSessions(sessions);
        }),
      );
    }

    if (claude.onAnalyticsUpdated) {
      unsubs.push(
        claude.onAnalyticsUpdated((data) => {
          useAnalyticsStore.getState().setSessionSummaries(data.summaries);
          useAnalyticsStore.getState().setTodayCost(data.todayCost);
        }),
      );
    }

    if (claude.onUsageUpdated) {
      unsubs.push(
        claude.onUsageUpdated((stats) => {
          useUsageStore.getState().setUsageStats(stats);
        }),
      );
    }

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [claude]);
}
