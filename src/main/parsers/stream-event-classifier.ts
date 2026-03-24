import type {
  StreamEvent,
  TokenUsage,
  UserMessageEvent,
  AssistantMessageEvent,
  ToolUseEvent,
  ToolResultEvent,
  ProgressEvent,
} from "../../shared/types/events";

/**
 * Safely read a nested field from an unknown record without throwing.
 */
function get(obj: unknown, ...keys: string[]): unknown {
  let cur: unknown = obj;
  for (const key of keys) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function str(val: unknown): string {
  if (typeof val === "string") return val;
  return "";
}

function num(val: unknown): number {
  if (typeof val === "number") return val;
  return 0;
}

/**
 * Parse a timestamp value that may be a number (ms or seconds) or an ISO string.
 * Claude Code JSONL files store timestamps as ISO strings like "2026-03-23T23:25:50.577Z".
 */
function parseTimestamp(val: unknown): number {
  if (typeof val === "number") {
    // If the value looks like seconds (< 1e12), convert to ms.
    return val < 1e12 ? val * 1000 : val;
  }
  if (typeof val === "string" && val.length > 0) {
    const ms = new Date(val).getTime();
    if (!isNaN(ms)) return ms;
  }
  return Date.now();
}

/**
 * Extract a {@link TokenUsage} block from a `message.usage` object.
 * Returns `undefined` when the usage data is absent or entirely zero.
 */
function extractTokenUsage(
  raw: Record<string, unknown>,
): TokenUsage | undefined {
  const usage = get(raw, "message", "usage");
  if (usage === null || typeof usage !== "object") return undefined;

  const u = usage as Record<string, unknown>;
  const inputTokens = num(u["input_tokens"]);
  const outputTokens = num(u["output_tokens"]);
  const cacheReadInputTokens = num(u["cache_read_input_tokens"]);
  const cacheCreationInputTokens = num(u["cache_creation_input_tokens"]);

  if (
    inputTokens === 0 &&
    outputTokens === 0 &&
    cacheReadInputTokens === 0 &&
    cacheCreationInputTokens === 0
  ) {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
  };
}

/**
 * Extract the assistant's text content from `message.content`.
 * Content may be a string, an array of content blocks, or absent.
 */
function extractAssistantText(raw: Record<string, unknown>): string {
  const content = get(raw, "message", "content");
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (block): block is Record<string, unknown> =>
          block !== null &&
          typeof block === "object" &&
          (block as Record<string, unknown>)["type"] === "text",
      )
      .map((block) => str((block as Record<string, unknown>)["text"]))
      .join("");
  }
  return "";
}

/**
 * Classify a raw JSONL record into a typed {@link StreamEvent}.
 *
 * Dispatches on the top-level `type` field of the record.  For assistant
 * messages the content blocks are also inspected so that `tool_use` and
 * `tool_result` items nested inside a message are surfaced as first-class
 * events.
 */
export function classifyEvent(
  raw: Record<string, unknown>,
  sessionId: string,
): StreamEvent {
  const type = str(raw["type"]);
  const timestamp = parseTimestamp(raw["timestamp"]);

  // ── User message ──────────────────────────────────────────────────────
  if (type === "user") {
    const content = get(raw, "message", "content");

    // Check for tool_result blocks (agent completion signals)
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block === null || typeof block !== "object") continue;
        const b = block as Record<string, unknown>;

        if (b["type"] === "tool_result") {
          const outputVal = b["content"];
          const output =
            typeof outputVal === "string"
              ? outputVal
              : Array.isArray(outputVal)
                ? (outputVal as unknown[])
                    .filter(
                      (x): x is Record<string, unknown> =>
                        x !== null && typeof x === "object",
                    )
                    .map((x) => str(x["text"]))
                    .join("")
                : "";

          const event: ToolResultEvent = {
            type: "tool_result",
            sessionId,
            timestamp,
            toolUseId: str(b["tool_use_id"]),
            output,
            isError: b["is_error"] === true,
          };
          return event;
        }
      }
    }

    let text = "";
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .filter(
          (b): b is Record<string, unknown> =>
            b !== null &&
            typeof b === "object" &&
            (b as Record<string, unknown>)["type"] === "text",
        )
        .map((b) => str((b as Record<string, unknown>)["text"]))
        .join("");
    }

    const event: UserMessageEvent = {
      type: "user_message",
      sessionId,
      timestamp,
      content: text,
    };
    return event;
  }

  // ── Assistant message ─────────────────────────────────────────────────
  if (type === "assistant") {
    // Check whether content contains a tool_use block — if so, emit as ToolUseEvent.
    const content = get(raw, "message", "content");
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block === null || typeof block !== "object") continue;
        const b = block as Record<string, unknown>;

        if (b["type"] === "tool_use") {
          const event: ToolUseEvent = {
            type: "tool_use",
            sessionId,
            timestamp,
            toolName: str(b["name"]),
            toolUseId: str(b["id"]),
            parentToolUseId:
              typeof b["parent_tool_use_id"] === "string"
                ? b["parent_tool_use_id"]
                : undefined,
            input:
              b["input"] !== null && typeof b["input"] === "object"
                ? (b["input"] as Record<string, unknown>)
                : {},
          };
          return event;
        }

        if (b["type"] === "tool_result") {
          const outputVal = b["content"];
          const output =
            typeof outputVal === "string"
              ? outputVal
              : Array.isArray(outputVal)
                ? (outputVal as unknown[])
                    .filter(
                      (x): x is Record<string, unknown> =>
                        x !== null && typeof x === "object",
                    )
                    .map((x) => str(x["text"]))
                    .join("")
                : "";

          const event: ToolResultEvent = {
            type: "tool_result",
            sessionId,
            timestamp,
            toolUseId: str(b["tool_use_id"]),
            output,
            isError: b["is_error"] === true,
          };
          return event;
        }
      }
    }

    const assistantEvent: AssistantMessageEvent = {
      type: "assistant_message",
      sessionId,
      timestamp,
      content: extractAssistantText(raw),
      model:
        typeof get(raw, "message", "model") === "string"
          ? str(get(raw, "message", "model"))
          : undefined,
      usage: extractTokenUsage(raw),
      stopReason:
        typeof get(raw, "message", "stop_reason") === "string"
          ? str(get(raw, "message", "stop_reason"))
          : undefined,
    };
    return assistantEvent;
  }

  // ── Hook progress event ───────────────────────────────────────────────
  if (
    type === "progress" ||
    str(get(raw, "data", "type") as unknown) === "hook_progress"
  ) {
    const data = get(raw, "data");
    const dataObj =
      data !== null && typeof data === "object"
        ? (data as Record<string, unknown>)
        : {};

    const event: ProgressEvent = {
      type: "progress",
      sessionId,
      timestamp,
      hookEvent:
        typeof dataObj["hook_event"] === "string"
          ? str(dataObj["hook_event"])
          : undefined,
      hookName:
        typeof dataObj["hook_name"] === "string"
          ? str(dataObj["hook_name"])
          : undefined,
      message:
        typeof dataObj["message"] === "string"
          ? str(dataObj["message"])
          : undefined,
    };
    return event;
  }

  // ── System ────────────────────────────────────────────────────────────
  if (type === "system") {
    return { type: "system", sessionId, timestamp };
  }

  // ── Unknown ───────────────────────────────────────────────────────────
  return { type: "unknown", sessionId, timestamp };
}
