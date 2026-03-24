/**
 * Session-related types shared between main process, preload, and renderer.
 * A "session" corresponds to a single Claude Code CLI process instance.
 */

/**
 * Persisted metadata for a Claude Code session, enriched with token usage
 * and cost data accumulated over the lifetime of the session.
 */
export interface SessionMeta {
  sessionId: string
  name: string
  /** Absolute path to the working directory the session was started in. */
  cwd: string
  /** Unix timestamp (ms) when the session was first created. */
  createdAt: number
  /** Unix timestamp (ms) of the most recent activity in this session. */
  lastActiveAt: number
  /** Claude model slug used in this session, e.g. "claude-sonnet-4-6". */
  model?: string
  /** Current git branch of the cwd at session creation time, if detectable. */
  gitBranch?: string
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheWriteTokens: number
  /** Accumulated estimated cost in US dollars for the lifetime of this session. */
  estimatedCostUSD: number
  /** Whether the underlying PTY process is still running. */
  isActive: boolean
}

/**
 * Returned by the session-create IPC handler after spawning a new PTY process.
 */
export interface SessionCreateResult {
  sessionId: string
  name: string
  cwd: string
}

/**
 * Represents a session that currently has a live PTY process attached.
 */
export interface ActiveSession {
  sessionId: string
  name: string
  cwd: string
  /** OS process ID of the PTY child process. */
  pid: number
}
