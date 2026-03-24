import fs from 'fs'
import path from 'path'

export interface UsageStats {
  /** Number of assistant messages counted today. */
  messagesUsed: number
  /** Rough estimated daily limit based on observed subscription tier. */
  estimatedLimit: number
  /** Percentage of estimated limit consumed (0-100). */
  percentUsed: number
  /** Unix timestamp (ms) of the oldest message in the window. */
  oldestMessageTime: number
  /** Unix timestamp (ms) of the most recent message in the window. */
  newestMessageTime: number
  /** Milliseconds until the estimated daily reset (midnight local time). */
  resetEstimate: number
  /** Qualitative rate health based on usage percentage. */
  rateStatus: 'healthy' | 'moderate' | 'high' | 'rate_limited'
}

/**
 * Recursively find all `.jsonl` files under `rootDir`.
 */
function findJsonlFiles(rootDir: string): string[] {
  const results: string[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    const full = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findJsonlFiles(full))
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      results.push(full)
    }
  }
  return results
}

/**
 * The start of "today" (midnight local time) in Unix ms.
 */
function todayStartMs(): number {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

/**
 * Ms remaining until midnight (local) — the estimated reset time.
 */
function msUntilMidnight(): number {
  const now = Date.now()
  const tomorrow = todayStartMs() + 86_400_000
  return Math.max(0, tomorrow - now)
}

/**
 * Tracks Claude subscription usage by counting assistant responses
 * in today's JSONL session files.
 *
 * Usage is estimated against a rough daily cap:
 * - Claude Max: ~500 messages/day
 * - Claude Pro: ~100 messages/day (fallback when usage is low)
 *
 * The tracker detects which tier is active by observing total usage volume.
 */
export class UsageTracker {
  private homeDir: string

  constructor(homeDir: string) {
    this.homeDir = homeDir
  }

  /**
   * Scan all today's JSONL files and accumulate assistant message counts.
   */
  getUsageStats(): UsageStats {
    const projectsDir = path.join(this.homeDir, '.claude', 'projects')
    const windowStart = todayStartMs()

    let messagesUsed = 0
    let oldestMessageTime = 0
    let newestMessageTime = 0
    let hasRateLimitError = false

    if (!fs.existsSync(projectsDir)) {
      return this.buildStats(0, 0, 0, false)
    }

    const files = findJsonlFiles(projectsDir)

    for (const filePath of files) {
      // Quick stat check: skip files not touched today.
      try {
        const stat = fs.statSync(filePath)
        if (stat.mtimeMs < windowStart) continue
      } catch {
        continue
      }

      let fd: number | undefined
      try {
        const stats = fs.statSync(filePath)
        fd = fs.openSync(filePath, 'r')
        const CHUNK = 65536
        const buf = Buffer.allocUnsafe(CHUNK)
        let fileOffset = 0
        let leftover = ''

        while (fileOffset < stats.size) {
          const bytesRead = fs.readSync(fd, buf, 0, CHUNK, fileOffset)
          if (bytesRead === 0) break
          fileOffset += bytesRead

          const chunk = leftover + buf.subarray(0, bytesRead).toString('utf8')
          const lines = chunk.split('\n')
          leftover = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed.length === 0) continue

            let obj: Record<string, unknown>
            try {
              const parsed = JSON.parse(trimmed)
              if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) continue
              obj = parsed as Record<string, unknown>
            } catch {
              continue
            }

            const ts = typeof obj['timestamp'] === 'number' ? (obj['timestamp'] as number) : 0
            // Only count events within today's window.
            if (ts > 0 && ts < windowStart) continue

            const type = typeof obj['type'] === 'string' ? obj['type'] : ''

            // Each assistant line = one Claude response = one "message used".
            if (type === 'assistant') {
              messagesUsed++
              if (ts > 0) {
                if (oldestMessageTime === 0 || ts < oldestMessageTime) oldestMessageTime = ts
                if (ts > newestMessageTime) newestMessageTime = ts
              }
            }

            // Detect rate limit errors in tool results or system messages.
            if (!hasRateLimitError && type === 'tool_result') {
              const output = typeof obj['output'] === 'string' ? (obj['output'] as string) : ''
              if (/rate.?limit|too many requests|overloaded/i.test(output)) {
                hasRateLimitError = true
              }
            }
          }

          // Process leftover at file end.
          if (leftover.trim().length > 0) {
            try {
              const obj = JSON.parse(leftover.trim()) as Record<string, unknown>
              if (obj !== null && typeof obj['type'] === 'string' && obj['type'] === 'assistant') {
                const ts = typeof obj['timestamp'] === 'number' ? (obj['timestamp'] as number) : 0
                if (ts === 0 || ts >= windowStart) {
                  messagesUsed++
                  if (ts > 0) {
                    if (oldestMessageTime === 0 || ts < oldestMessageTime) oldestMessageTime = ts
                    if (ts > newestMessageTime) newestMessageTime = ts
                  }
                }
              }
            } catch {
              // ignore malformed trailing line
            }
          }
        }
      } catch {
        // File temporarily inaccessible — skip.
      } finally {
        if (fd !== undefined) {
          try { fs.closeSync(fd) } catch { /* ignore */ }
        }
      }
    }

    return this.buildStats(messagesUsed, oldestMessageTime, newestMessageTime, hasRateLimitError)
  }

  /**
   * Estimate remaining messages and confidence level.
   *
   * Confidence is high when we have a clear usage pattern (>10 messages seen),
   * medium when some data exists, low when we have very little data.
   */
  estimateRemaining(stats?: UsageStats): { estimated: number; confidence: 'high' | 'medium' | 'low' } {
    const s = stats ?? this.getUsageStats()
    const remaining = Math.max(0, s.estimatedLimit - s.messagesUsed)

    let confidence: 'high' | 'medium' | 'low'
    if (s.messagesUsed >= 20) confidence = 'high'
    else if (s.messagesUsed >= 5) confidence = 'medium'
    else confidence = 'low'

    return { estimated: remaining, confidence }
  }

  private buildStats(
    messagesUsed: number,
    oldestMessageTime: number,
    newestMessageTime: number,
    hasRateLimitError: boolean,
  ): UsageStats {
    // Estimate tier from observed usage: if anyone has used >100, assume Max.
    const estimatedLimit = messagesUsed > 80 ? 500 : 100
    const percentUsed = estimatedLimit > 0
      ? Math.min(100, Math.round((messagesUsed / estimatedLimit) * 100))
      : 0

    let rateStatus: UsageStats['rateStatus']
    if (hasRateLimitError) {
      rateStatus = 'rate_limited'
    } else if (percentUsed >= 85) {
      rateStatus = 'high'
    } else if (percentUsed >= 60) {
      rateStatus = 'moderate'
    } else {
      rateStatus = 'healthy'
    }

    return {
      messagesUsed,
      estimatedLimit,
      percentUsed,
      oldestMessageTime,
      newestMessageTime,
      resetEstimate: msUntilMidnight(),
      rateStatus,
    }
  }
}
