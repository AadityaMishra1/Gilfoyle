/**
 * CostAggregator owns all cross-session cost and token analytics.
 *
 * Responsibilities:
 *   - Create and update per-session SessionCostTracker instances
 *   - Maintain daily rollups keyed by YYYY-MM-DD (local time)
 *   - Persist the full analytics payload to ~/.gilfoyle/analytics.json
 *   - Reload that payload on startup so history survives across app restarts
 */

import fs from "fs";
import path from "path";
import { calculateMessageCost } from "../../shared/pricing";
import { SessionCostTracker } from "../parsers/cost-calculator";
import type { TokenUsage } from "../../shared/types/events";
import type {
  SessionCostSummary,
  DailyCostRollup,
} from "../../shared/types/analytics";
import type { SessionMeta } from "../../shared/types/session";

/** Shape of the JSON written to disk. */
interface PersistedAnalytics {
  sessions: SessionCostSummary[];
  dailyRollups: DailyCostRollup[];
}

/** Return today's date as a YYYY-MM-DD string in local time. */
function todayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Return a date string YYYY-MM-DD for any Unix timestamp (ms) in local time. */
function dateKeyFromTimestamp(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export class CostAggregator {
  private dataDir: string;
  private analyticsPath: string;
  private trackers: Map<string, SessionCostTracker>;
  private dailyRollups: Map<string, DailyCostRollup>;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.analyticsPath = path.join(dataDir, "analytics.json");
    this.trackers = new Map();
    this.dailyRollups = new Map();
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Record a new token usage event for `sessionId`.
   * Creates a tracker on first encounter; updates the daily rollup for today.
   */
  trackUsage(sessionId: string, model: string, usage: TokenUsage): void {
    // Ensure a tracker exists for this session
    if (!this.trackers.has(sessionId)) {
      this.trackers.set(sessionId, new SessionCostTracker(sessionId, model));
    }

    const tracker = this.trackers.get(sessionId)!;
    tracker.addUsage(usage, model);

    // Update the daily rollup for today
    this.updateDailyRollup(model, usage);
  }

  /** Return the cost summary for a single session, or null if unknown. */
  getSessionSummary(sessionId: string): SessionCostSummary | null {
    return this.trackers.get(sessionId)?.getSummary() ?? null;
  }

  /** Return cost summaries for every tracked session, newest first. */
  getAllSummaries(): SessionCostSummary[] {
    return Array.from(this.trackers.values())
      .map((t) => t.getSummary())
      .sort((a, b) => b.lastUpdateTime - a.lastUpdateTime);
  }

  /**
   * Return daily rollups for dates within the inclusive range
   * [startDate, endDate] (YYYY-MM-DD strings). Results are sorted
   * chronologically ascending.
   */
  getDailyRollups(startDate: string, endDate: string): DailyCostRollup[] {
    return Array.from(this.dailyRollups.values())
      .filter((r) => r.date >= startDate && r.date <= endDate)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Return the total estimated cost accumulated so far today (USD). */
  getTodayCost(): number {
    return this.dailyRollups.get(todayKey())?.totalCostUSD ?? 0;
  }

  /**
   * Seed a tracker from a {@link SessionMeta} object produced by
   * {@link SessionIndex.scanAll}. Used at startup to pre-populate analytics
   * from existing session files when no persisted analytics.json exists yet.
   *
   * Only called when the session is not already tracked, so it will not
   * overwrite live data accumulated during the current app session.
   */
  seedFromSessionMeta(session: SessionMeta): void {
    if (this.trackers.has(session.sessionId)) return;
    if (session.model === undefined || session.model.length === 0) return;

    const summary: SessionCostSummary = {
      sessionId: session.sessionId,
      model: session.model,
      totalInputTokens: session.totalInputTokens,
      totalOutputTokens: session.totalOutputTokens,
      totalCacheReadTokens: session.totalCacheReadTokens,
      totalCacheWriteTokens: session.totalCacheWriteTokens,
      totalCostUSD: session.estimatedCostUSD,
      // Session files don't record message count — approximate as 0.
      messageCount: 0,
      startTime: session.createdAt,
      lastUpdateTime: session.lastActiveAt,
    };

    const tracker = new SessionCostTracker(session.sessionId, session.model);
    tracker.restoreSummary(summary);
    this.trackers.set(session.sessionId, tracker);
  }

  /** Write current state to ~/.gilfoyle/analytics.json. */
  save(): void {
    try {
      this.ensureDataDir();
      const payload: PersistedAnalytics = {
        sessions: this.getAllSummaries(),
        dailyRollups: Array.from(this.dailyRollups.values()),
      };
      fs.writeFileSync(
        this.analyticsPath,
        JSON.stringify(payload, null, 2),
        "utf8",
      );
    } catch (err) {
      console.error("[CostAggregator] Failed to save analytics:", err);
    }
  }

  /** Load previously persisted state from disk (if the file exists). */
  load(): void {
    try {
      if (!fs.existsSync(this.analyticsPath)) return;

      const raw = fs.readFileSync(this.analyticsPath, "utf8");
      const data = JSON.parse(raw) as Partial<PersistedAnalytics>;

      // Restore session trackers
      for (const summary of data.sessions ?? []) {
        const tracker = new SessionCostTracker(
          summary.sessionId,
          summary.model,
        );
        tracker.restoreSummary(summary);
        this.trackers.set(summary.sessionId, tracker);
      }

      // Restore daily rollups
      for (const rollup of data.dailyRollups ?? []) {
        this.dailyRollups.set(rollup.date, rollup);
      }
    } catch (err) {
      console.warn("[CostAggregator] Could not load analytics from disk:", err);
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * Merge a new usage event into the daily rollup for today.
   * Computes the cost delta from the raw usage so we don't need to
   * re-derive it from session trackers.
   */
  private updateDailyRollup(model: string, usage: TokenUsage): void {
    const key = todayKey();
    const existing = this.dailyRollups.get(key);

    // Count distinct sessions active today.
    // We derive this lazily from getAllSummaries() to avoid a separate counter.
    const sessionsToday = Array.from(this.trackers.values())
      .map((t) => t.getSummary())
      .filter((s) => dateKeyFromTimestamp(s.lastUpdateTime) === key).length;

    const costDelta = calculateMessageCost(
      model,
      usage.inputTokens,
      usage.outputTokens,
      usage.cacheReadInputTokens,
      usage.cacheCreationInputTokens,
    );

    if (!existing) {
      this.dailyRollups.set(key, {
        date: key,
        totalCostUSD: costDelta,
        totalInputTokens: usage.inputTokens,
        totalOutputTokens: usage.outputTokens,
        sessionCount: sessionsToday,
        topModel: model,
      });
      return;
    }

    // Recalculate topModel by comparing raw token volumes per model.
    // Simple heuristic: keep the previous topModel unless the current model
    // has contributed more tokens in this update.
    const newInputTotal = existing.totalInputTokens + usage.inputTokens;
    const newOutputTotal = existing.totalOutputTokens + usage.outputTokens;

    this.dailyRollups.set(key, {
      date: key,
      totalCostUSD: existing.totalCostUSD + costDelta,
      totalInputTokens: newInputTotal,
      totalOutputTokens: newOutputTotal,
      sessionCount: sessionsToday,
      // Update topModel only when cost contribution suggests a switch
      topModel: existing.topModel,
    });
  }
}
