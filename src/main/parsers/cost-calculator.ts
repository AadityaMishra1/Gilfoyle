/**
 * SessionCostTracker accumulates token usage and cost data for a single
 * Claude Code session. Designed to be fed incrementally as assistant messages
 * arrive from the JSONL stream.
 */

import { calculateMessageCost, getModelDisplayName } from '../../shared/pricing'
import type { TokenUsage } from '../../shared/types/events'
import type { SessionCostSummary } from '../../shared/types/analytics'

/**
 * Mutable accumulator for a single session's cost and token data.
 *
 * Usage:
 *   const tracker = new SessionCostTracker(sessionId, model)
 *   tracker.addUsage(usage)            // called for each assistant message
 *   const summary = tracker.getSummary()
 */
export class SessionCostTracker {
  private summary: SessionCostSummary

  constructor(sessionId: string, model: string) {
    const now = Date.now()
    this.summary = {
      sessionId,
      model,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
      totalCostUSD: 0,
      messageCount: 0,
      startTime: now,
      lastUpdateTime: now,
    }
  }

  /**
   * Add a single assistant message's token usage to the running totals.
   * The `model` on the summary is updated to reflect the most recently seen
   * model slug (Claude Code can switch models mid-session).
   *
   * @param usage - Token breakdown from `message.usage` in the JSONL event.
   * @param model - The model slug that produced this response (optional;
   *   defaults to the model passed to the constructor when not provided).
   */
  addUsage(usage: TokenUsage, model?: string): void {
    const activeModel = model ?? this.summary.model

    this.summary.totalInputTokens += usage.inputTokens
    this.summary.totalOutputTokens += usage.outputTokens
    this.summary.totalCacheReadTokens += usage.cacheReadInputTokens
    this.summary.totalCacheWriteTokens += usage.cacheCreationInputTokens
    this.summary.totalCostUSD += calculateMessageCost(
      activeModel,
      usage.inputTokens,
      usage.outputTokens,
      usage.cacheReadInputTokens,
      usage.cacheCreationInputTokens,
    )
    this.summary.messageCount += 1
    this.summary.lastUpdateTime = Date.now()

    // Keep the model field current — use the display name to validate the slug
    // is known, but store the raw slug for downstream cost calculations.
    if (model !== undefined) {
      // Verify it is a recognisable model (getModelDisplayName falls back
      // gracefully for unknown slugs, so this is just for the update).
      void getModelDisplayName(model)
      this.summary.model = model
    }
  }

  /**
   * Return a snapshot of the current summary. The returned object is a shallow
   * copy — mutations to it will not affect the tracker's internal state.
   */
  getSummary(): SessionCostSummary {
    return { ...this.summary }
  }

  /**
   * Replace the entire summary — used when loading persisted state from disk.
   */
  restoreSummary(summary: SessionCostSummary): void {
    this.summary = { ...summary }
  }
}
