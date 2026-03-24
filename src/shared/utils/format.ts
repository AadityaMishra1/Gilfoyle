/**
 * Display formatting utilities used across both the main process (for log
 * output) and the renderer (for UI labels).
 *
 * All functions are pure — no side effects, no I/O.
 */

/**
 * Format a raw token count into a compact human-readable string.
 *
 * | Range           | Format   | Example          |
 * |-----------------|----------|------------------|
 * | >= 1,000,000    | `{n}M`   | `1.23M`          |
 * | >= 10,000       | `{n}K`   | `12.3K`          |
 * | >= 1,000        | `{n}K`   | `1.23K`          |
 * | < 1,000         | `{n}`    | `123`            |
 *
 * @param tokens - Non-negative integer token count.
 * @returns Formatted string with suffix.
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return (tokens / 1_000_000).toFixed(2) + 'M'
  if (tokens >= 10_000) return (tokens / 1_000).toFixed(1) + 'K'
  if (tokens >= 1_000) return (tokens / 1_000).toFixed(2) + 'K'
  return tokens.toString()
}

/**
 * Format a USD cost value into a dollar string with context-sensitive precision.
 *
 * | Range      | Decimal places | Example   |
 * |------------|----------------|-----------|
 * | < $0.01    | 4              | `$0.0034` |
 * | < $1.00    | 3              | `$0.123`  |
 * | >= $1.00   | 2              | `$15.68`  |
 *
 * @param usd - Cost in US dollars (non-negative).
 * @returns Dollar-prefixed string.
 */
export function formatCost(usd: number): string {
  if (usd < 0.01) return '$' + usd.toFixed(4)
  if (usd < 1) return '$' + usd.toFixed(3)
  return '$' + usd.toFixed(2)
}

/**
 * Format a duration in milliseconds into a compact human-readable string.
 *
 * | Range       | Format     | Example    |
 * |-------------|------------|------------|
 * | < 60s       | `{n}s`     | `45s`      |
 * | < 60m       | `{n}m {n}s`| `2m 30s`   |
 * | >= 60m      | `{n}h {n}m`| `1h 15m`   |
 *
 * @param ms - Duration in milliseconds (non-negative).
 * @returns Formatted duration string.
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1_000)
  if (totalSeconds < 60) return totalSeconds + 's'

  const minutes = Math.floor(totalSeconds / 60)
  const remainingSeconds = totalSeconds % 60

  if (minutes < 60) return minutes + 'm ' + remainingSeconds + 's'

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return hours + 'h ' + remainingMinutes + 'm'
}

/**
 * Format a Unix timestamp (ms) as a relative time string from the current
 * moment.
 *
 * | Age          | Output          |
 * |--------------|-----------------|
 * | < 1 minute   | `just now`      |
 * | < 1 hour     | `{n}m ago`      |
 * | < 1 day      | `{n}h ago`      |
 * | >= 1 day     | `{n}d ago`      |
 *
 * @param timestamp - Unix timestamp in milliseconds.
 * @returns Human-readable relative time string.
 */
export function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp
  if (diffMs < 60_000) return 'just now'
  if (diffMs < 3_600_000) return Math.floor(diffMs / 60_000) + 'm ago'
  if (diffMs < 86_400_000) return Math.floor(diffMs / 3_600_000) + 'h ago'
  return Math.floor(diffMs / 86_400_000) + 'd ago'
}

/**
 * Format a Unix timestamp (ms) as a short locale date string.
 *
 * @param timestamp - Unix timestamp in milliseconds.
 * @returns Formatted date string, e.g. `"Mar 23, 2026"`.
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
