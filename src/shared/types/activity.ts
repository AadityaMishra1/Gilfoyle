/**
 * Activity event types representing high-level Claude Code tool operations.
 * These are derived from raw JSONL tool_use events and surfaced in the UI.
 */
export type ActivityType =
  | 'file_create'
  | 'file_edit'
  | 'file_delete'
  | 'test_run'
  | 'git_op'
  | 'shell_cmd'
  | 'tool_call'
  | 'agent_spawn'
  | 'error'

/**
 * A single human-readable activity event derived from a Claude Code tool call.
 */
export interface ActivityEvent {
  id: string
  type: ActivityType
  /** Short human-readable summary, e.g. "Edited src/auth.ts (+12 -3)". Max 50 chars. */
  summary: string
  /** Full command, diff, or detail — shown on expand. */
  detail?: string
  /** Unix timestamp (ms). */
  timestamp: number
  sessionId: string
  projectPath: string
  /** Lucide icon name for this activity type. */
  icon: string
  /** Tailwind color token for the left border accent. */
  color: string
}
