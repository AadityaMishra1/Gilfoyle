/**
 * Analytics and cost-tracking types shared across the application.
 * Cost data is derived from token usage and the pricing constants in
 * `src/shared/pricing.ts`.
 */

/**
 * A single cost data point captured after each assistant response.
 * Stored in the analytics DB and used to build rollup summaries.
 */
export interface CostData {
  sessionId: string
  /** The model slug that produced this response. */
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  estimatedCostUSD: number
  /** Unix timestamp (ms) when this data point was recorded. */
  timestamp: number
}

/**
 * Aggregated cost and usage metrics for the full lifetime of one session.
 * Updated incrementally as new {@link CostData} points arrive.
 */
export interface SessionCostSummary {
  sessionId: string
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheWriteTokens: number
  totalCostUSD: number
  /** Total number of assistant messages received in this session. */
  messageCount: number
  /** Unix timestamp (ms) of the first message in this session. */
  startTime: number
  /** Unix timestamp (ms) of the most recently recorded data point. */
  lastUpdateTime: number
  /** The most recently observed model slug for this session. */
  model: string
}

/**
 * Daily aggregated cost rollup, used to power the usage chart in the
 * Analytics panel.
 */
export interface DailyCostRollup {
  /** ISO date string in YYYY-MM-DD format, in the user's local timezone. */
  date: string
  totalCostUSD: number
  totalInputTokens: number
  totalOutputTokens: number
  /** Number of distinct sessions that had activity on this date. */
  sessionCount: number
  /** The model that accounted for the most tokens on this date. */
  topModel: string
}

/**
 * User-configurable spending alert. When the accumulated cost for the given
 * `period` crosses `threshold`, the UI surfaces a warning notification.
 */
export interface BudgetAlert {
  /** Dollar amount (USD) that triggers the alert when exceeded. */
  threshold: number
  period: 'daily' | 'weekly' | 'monthly'
  enabled: boolean
}
