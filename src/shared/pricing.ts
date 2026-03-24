/**
 * Model pricing constants and cost calculation utilities.
 * All prices are in USD per one million tokens, as of March 2026.
 *
 * Update this file whenever Anthropic publishes new pricing — it is the
 * single source of truth for cost estimation across the application.
 */

/**
 * Pricing configuration for a single Claude model.
 * All per-million-token rates are in USD.
 */
export interface ModelPricing {
  /** Cost per million input (prompt) tokens. */
  inputPerMillion: number
  /** Cost per million output (completion) tokens. */
  outputPerMillion: number
  /** Cost per million tokens read from the prompt cache. */
  cacheReadPerMillion: number
  /** Cost per million tokens written into the prompt cache. */
  cacheWritePerMillion: number
  /** Maximum context window size in tokens. */
  contextWindow: number
  /** Human-readable display name shown in the UI. */
  displayName: string
}

/**
 * Pricing table keyed by Claude model slug.
 * Always falls back to the `"default"` entry for unknown model identifiers.
 *
 * Prices sourced from https://www.anthropic.com/pricing (March 2026).
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-6': {
    inputPerMillion: 15,
    outputPerMillion: 75,
    cacheReadPerMillion: 1.5,
    cacheWritePerMillion: 18.75,
    contextWindow: 200_000,
    displayName: 'Claude Opus 4.6',
  },
  'claude-sonnet-4-6': {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheReadPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
    contextWindow: 200_000,
    displayName: 'Claude Sonnet 4.6',
  },
  'claude-haiku-4-5': {
    inputPerMillion: 0.8,
    outputPerMillion: 4,
    cacheReadPerMillion: 0.08,
    cacheWritePerMillion: 1,
    contextWindow: 200_000,
    displayName: 'Claude Haiku 4.5',
  },
  // Fallback entry used when the model slug is not found in this table.
  default: {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheReadPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
    contextWindow: 200_000,
    displayName: 'Unknown Model',
  },
}

/**
 * Calculate the estimated cost in USD for a single assistant response.
 *
 * @param model - Claude model slug (e.g. "claude-sonnet-4-6"). Falls back to
 *   "default" pricing when the slug is not found in {@link MODEL_PRICING}.
 * @param inputTokens - Number of prompt tokens billed at the standard input rate.
 * @param outputTokens - Number of completion tokens.
 * @param cacheReadTokens - Number of tokens served from the prompt cache.
 * @param cacheWriteTokens - Number of tokens written to the prompt cache.
 * @returns Estimated cost in USD as a floating-point number.
 */
export function calculateMessageCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['default']
  return (
    (inputTokens * pricing.inputPerMillion) / 1_000_000 +
    (outputTokens * pricing.outputPerMillion) / 1_000_000 +
    (cacheReadTokens * pricing.cacheReadPerMillion) / 1_000_000 +
    (cacheWriteTokens * pricing.cacheWritePerMillion) / 1_000_000
  )
}

/**
 * Return the human-readable display name for a model slug.
 * Falls back to the raw slug string when the model is not in the pricing table.
 *
 * @param model - Claude model slug.
 * @returns Display name suitable for UI labels.
 */
export function getModelDisplayName(model: string): string {
  return MODEL_PRICING[model]?.displayName ?? model
}

/**
 * Return the maximum context window size (in tokens) for a model slug.
 * Falls back to 200,000 for unknown models.
 *
 * @param model - Claude model slug.
 * @returns Context window size in tokens.
 */
export function getContextWindow(model: string): number {
  return MODEL_PRICING[model]?.contextWindow ?? 200_000
}
