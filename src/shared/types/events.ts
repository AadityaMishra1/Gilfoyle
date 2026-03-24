/**
 * Stream event types parsed from Claude Code's JSONL output.
 * Each line emitted by the CLI is parsed into one of these discriminated
 * union members and forwarded to the renderer via the STREAM_EVENT IPC channel.
 */

export type StreamEventType =
  | 'user_message'
  | 'assistant_message'
  | 'tool_use'
  | 'tool_result'
  | 'progress'
  | 'file_snapshot'
  | 'system'
  | 'unknown'

/** Fields present on every stream event regardless of type. */
export interface BaseStreamEvent {
  type: StreamEventType
  /** Unix timestamp (ms) when the event was parsed by the main process. */
  timestamp: number
  sessionId: string
}

/** A message submitted by the user to the Claude Code CLI. */
export interface UserMessageEvent extends BaseStreamEvent {
  type: 'user_message'
  content: string
}

/** A text response emitted by the assistant model. */
export interface AssistantMessageEvent extends BaseStreamEvent {
  type: 'assistant_message'
  content: string
  /** The model slug that produced this response, e.g. "claude-sonnet-4-6". */
  model?: string
  usage?: TokenUsage
  /** The reason the model stopped generating, e.g. "end_turn" or "tool_use". */
  stopReason?: string
}

/** The model requesting a tool invocation. */
export interface ToolUseEvent extends BaseStreamEvent {
  type: 'tool_use'
  /** Name of the tool being invoked, e.g. "Bash", "Read", "Write". */
  toolName: string
  /** Stable identifier for this specific tool call, used to correlate with its result. */
  toolUseId: string
  /** Set when this tool call is nested inside another (e.g. a sub-agent call). */
  parentToolUseId?: string
  /** The raw input arguments passed to the tool. */
  input: Record<string, unknown>
}

/** The output returned by a tool after execution. */
export interface ToolResultEvent extends BaseStreamEvent {
  type: 'tool_result'
  /** Corresponds to the `toolUseId` from the matching {@link ToolUseEvent}. */
  toolUseId: string
  output: string
  /** True when the tool exited with a non-zero status or threw an exception. */
  isError: boolean
}

/** A lifecycle progress notification emitted by Claude Code hooks. */
export interface ProgressEvent extends BaseStreamEvent {
  type: 'progress'
  /** The hook lifecycle event name, e.g. "PreToolUse", "PostToolUse". */
  hookEvent?: string
  /** The name of the hook that produced this event. */
  hookName?: string
  message?: string
}

/**
 * A snapshot of one or more files captured at a point in time.
 * The `files` map is keyed by absolute file path, valued by full file content.
 */
export interface FileSnapshotEvent extends BaseStreamEvent {
  type: 'file_snapshot'
  /** Map of absolute file path to full file content at snapshot time. */
  files: Record<string, string>
}

/** Token usage breakdown for a single assistant response. */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  /** Tokens served from the prompt cache (billed at a reduced rate). */
  cacheReadInputTokens: number
  /** Tokens written into the prompt cache (billed at a higher rate). */
  cacheCreationInputTokens: number
}

/**
 * Discriminated union of all possible stream events.
 * Narrow via `event.type` in switch/if blocks.
 */
export type StreamEvent =
  | UserMessageEvent
  | AssistantMessageEvent
  | ToolUseEvent
  | ToolResultEvent
  | ProgressEvent
  | FileSnapshotEvent
  | (BaseStreamEvent & { type: 'system' | 'unknown' })
