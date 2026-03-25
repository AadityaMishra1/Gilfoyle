/**
 * AgentSection — Collapsible section showing active Claude subagents within
 * ToolsPanel. Derives agent tree from stream events (same logic as
 * SwarmMonitorPanel) but rendered as a compact flat list suitable for an
 * info-panel tab.
 *
 * Performance: Uses a ref-based record store with debounced React state updates
 * to avoid re-rendering on every stream event. CSS animations are static (no
 * animate-ping) to avoid GPU thrashing.
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  Bot,
  CheckCircle,
  XCircle,
  Clock,
  Network,
} from "lucide-react";
import type {
  ToolUseEvent,
  ToolResultEvent,
} from "../../../shared/types/events";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentRecord {
  id: string;
  name: string;
  role: string;
  status: "active" | "completed" | "failed";
  startTime: number;
  endTime?: number;
  prompt?: string;
  resultPreview?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AGENT_TOOLS = new Set(["Task", "Agent"]);

function extractName(input: Record<string, unknown>, toolName: string): string {
  const raw =
    typeof input["description"] === "string"
      ? input["description"]
      : typeof input["task"] === "string"
        ? input["task"]
        : typeof input["prompt"] === "string"
          ? input["prompt"]
          : null;

  if (raw === null) return toolName;
  return raw.length > 52 ? raw.slice(0, 49).trimEnd() + "..." : raw;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ─── Status icon (static glow, no animate-ping) ──────────────────────────────

const StatusIcon: React.FC<{ status: AgentRecord["status"] }> = ({
  status,
}) => {
  if (status === "active") {
    return (
      <span
        className="inline-flex h-2 w-2 shrink-0 rounded-full bg-amber-400"
        style={{ boxShadow: "0 0 4px 1px rgba(251,191,36,0.4)" }}
      />
    );
  }
  if (status === "completed") {
    return <CheckCircle size={11} className="text-emerald-400 shrink-0" />;
  }
  return <XCircle size={11} className="text-red-400 shrink-0" />;
};

// ─── Elapsed timer (pure display — no internal timer) ─────────────────────────

const ElapsedTimer: React.FC<{
  startTime: number;
  endTime?: number;
  now: number;
}> = ({ startTime, endTime, now }) => (
  <span
    className="inline-flex items-center gap-0.5 text-stone-500 tabular-nums shrink-0"
    style={{ fontSize: 9, fontFamily: "'Geist Mono', monospace" }}
  >
    <Clock size={8} className="shrink-0" />
    {formatElapsed((endTime ?? now) - startTime)}
  </span>
);

// ─── Agent row (expandable, memoized) ─────────────────────────────────────────

const AgentRow: React.FC<{ record: AgentRecord; now: number }> = React.memo(
  ({ record, now }) => {
    const [expanded, setExpanded] = useState(false);

    return (
      <div>
        <div
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-stone-800/30 transition-colors cursor-pointer"
          onClick={() => setExpanded((p) => !p)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setExpanded((p) => !p);
          }}
        >
          <StatusIcon status={record.status} />
          <span
            className="flex-1 min-w-0 truncate text-stone-300"
            style={{
              fontSize: 11,
              fontFamily: "'Geist', system-ui, sans-serif",
            }}
            title={record.name}
          >
            {record.name}
          </span>
          <span
            className="text-stone-600 px-1 py-px rounded bg-stone-800 ring-1 ring-stone-700/40 shrink-0 truncate max-w-[60px]"
            style={{ fontSize: 9, fontFamily: "'Geist Mono', monospace" }}
            title={record.role}
          >
            {record.role}
          </span>
          <ElapsedTimer
            startTime={record.startTime}
            endTime={record.endTime}
            now={now}
          />
        </div>

        {expanded && (
          <div className="mx-3 mb-1.5 p-2 rounded bg-stone-900/80 border border-stone-800/60">
            {record.prompt && (
              <pre
                className="text-stone-400 whitespace-pre-wrap break-words"
                style={{
                  fontSize: 10,
                  fontFamily: "'Geist Mono', monospace",
                  maxHeight: 120,
                  overflow: "auto",
                  lineHeight: 1.5,
                }}
              >
                {record.prompt}
              </pre>
            )}
            {record.resultPreview && (
              <div className="mt-1.5 pt-1.5 border-t border-stone-800/60">
                <span
                  className="text-stone-500 block mb-1"
                  style={{ fontSize: 9, fontFamily: "'Geist', system-ui" }}
                >
                  Result:
                </span>
                <pre
                  className="text-stone-400 whitespace-pre-wrap break-words"
                  style={{
                    fontSize: 10,
                    fontFamily: "'Geist Mono', monospace",
                    maxHeight: 100,
                    overflow: "auto",
                    lineHeight: 1.5,
                  }}
                >
                  {record.resultPreview}
                </pre>
              </div>
            )}
            {!record.prompt && !record.resultPreview && (
              <span
                className="text-stone-600"
                style={{ fontSize: 10, fontFamily: "'Geist Mono', monospace" }}
              >
                {record.status === "active"
                  ? "Running..."
                  : "No details available"}
              </span>
            )}
          </div>
        )}
      </div>
    );
  },
);

// ─── AgentSection ─────────────────────────────────────────────────────────────

interface EventRecord {
  useEvent: ToolUseEvent;
  resultEvent?: ToolResultEvent;
}

const AgentSection: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);

  // Use a ref as the primary store to avoid re-renders on every event.
  // A version counter triggers React updates on a debounced schedule.
  const recordsRef = useRef<Map<string, EventRecord>>(new Map());
  const [version, setVersion] = useState(0);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  // Flush pending changes to React state (debounced 250ms)
  const scheduleFlush = useCallback(() => {
    dirty.current = true;
    if (flushTimer.current !== null) return; // already scheduled
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      if (dirty.current) {
        dirty.current = false;
        setVersion((v) => v + 1);
      }
    }, 250);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (flushTimer.current !== null) clearTimeout(flushTimer.current);
    };
  }, []);

  // Process a single event into the ref store
  const processOne = useCallback((raw: unknown) => {
    const event = raw as { type?: string };
    if (!event || typeof event !== "object") return;

    if (event.type === "tool_use") {
      const e = raw as ToolUseEvent;
      if (!AGENT_TOOLS.has(e.toolName)) return;
      const existing = recordsRef.current.get(e.toolUseId);
      recordsRef.current.set(e.toolUseId, {
        useEvent: e,
        resultEvent: existing?.resultEvent,
      });
    } else if (event.type === "tool_result") {
      const e = raw as ToolResultEvent;
      const existing = recordsRef.current.get(e.toolUseId);
      if (!existing) return;
      recordsRef.current.set(e.toolUseId, { ...existing, resultEvent: e });
    }
  }, []);

  // Subscribe to stream events — handles both single events and batched arrays.
  const handleEvent = useCallback(
    (raw: unknown) => {
      const items = Array.isArray(raw) ? raw : [raw];
      for (const item of items) {
        processOne(item);
      }
      scheduleFlush();
    },
    [processOne, scheduleFlush],
  );

  // Subscribe to live stream events (filtered by projectPath in handleEvent).
  useEffect(() => {
    const win = window as unknown as {
      claude?: { onStreamEvent?: (cb: (e: unknown) => void) => () => void };
    };
    if (win.claude?.onStreamEvent) {
      return win.claude.onStreamEvent(handleEvent);
    }
    const domHandler = (e: Event) =>
      handleEvent((e as CustomEvent<unknown>).detail);
    window.addEventListener("claude:stream-event", domHandler);
    return () => window.removeEventListener("claude:stream-event", domHandler);
  }, [handleEvent]);

  // Build agent list from ref (only recomputes when version bumps)
  const agents = useMemo<AgentRecord[]>(() => {
    const list: AgentRecord[] = [];
    const now = Date.now();
    const cutoff = now - 30 * 60 * 1000;

    for (const [id, rec] of recordsRef.current) {
      if (rec.useEvent.timestamp < cutoff) continue;

      const name = extractName(rec.useEvent.input, rec.useEvent.toolName);
      const role =
        typeof rec.useEvent.input["subagent_type"] === "string"
          ? (rec.useEvent.input["subagent_type"] as string)
          : typeof rec.useEvent.input["role"] === "string"
            ? (rec.useEvent.input["role"] as string)
            : rec.useEvent.toolName;

      let status: AgentRecord["status"] = "active";
      let endTime: number | undefined;
      if (rec.resultEvent) {
        status = rec.resultEvent.isError ? "failed" : "completed";
        endTime = rec.resultEvent.timestamp;
      }
      if (!rec.resultEvent && now - rec.useEvent.timestamp > 10 * 60 * 1000) {
        status = "completed";
        endTime = rec.useEvent.timestamp + 10 * 60 * 1000;
      }

      const prompt =
        typeof rec.useEvent.input["prompt"] === "string"
          ? (rec.useEvent.input["prompt"] as string).slice(0, 500)
          : typeof rec.useEvent.input["description"] === "string"
            ? (rec.useEvent.input["description"] as string)
            : undefined;

      const resultPreview = rec.resultEvent?.output
        ? rec.resultEvent.output.slice(0, 300)
        : undefined;

      list.push({
        id,
        name,
        role,
        status,
        startTime: rec.useEvent.timestamp,
        endTime,
        prompt,
        resultPreview,
      });
    }
    return list.sort((a, b) => b.startTime - a.startTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const activeCount = useMemo(
    () => agents.filter((a) => a.status === "active").length,
    [agents],
  );

  // Single timer: 5s interval, only when expanded and agents are active
  const [now, setNow] = useState(() => Date.now());
  const timerEnabled = !collapsed && activeCount > 0;
  useEffect(() => {
    if (!timerEnabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, [timerEnabled]);

  return (
    <div className="border-b border-stone-800">
      <button
        type="button"
        onClick={() => setCollapsed((p) => !p)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-stone-800/40 transition-colors cursor-pointer"
      >
        {collapsed ? (
          <ChevronRight size={11} className="text-stone-500 shrink-0" />
        ) : (
          <ChevronDown size={11} className="text-stone-500 shrink-0" />
        )}
        <Network size={11} className="text-[#e8a872] shrink-0" />
        <span
          className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 flex-1 text-left"
          style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
        >
          Active Agents
        </span>
        {activeCount > 0 && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-px rounded-full bg-amber-900/30
              text-amber-400 ring-1 ring-amber-700/40 tabular-nums shrink-0"
            style={{ fontSize: 9, fontFamily: "'Geist Mono', monospace" }}
          >
            {activeCount} active
          </span>
        )}
        {agents.length > 0 && (
          <span
            className="text-stone-600 tabular-nums shrink-0"
            style={{ fontSize: 9, fontFamily: "'Geist Mono', monospace" }}
          >
            {agents.length}
          </span>
        )}
      </button>

      {!collapsed && (
        <div className="pb-1">
          {agents.length === 0 ? (
            <div className="flex items-start gap-2 px-4 py-2">
              <Bot size={11} className="text-stone-700 shrink-0 mt-px" />
              <span
                className="text-[10px] text-stone-600 leading-snug"
                style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
              >
                Agents appear when Claude spawns parallel workers
              </span>
            </div>
          ) : (
            agents.map((agent) => (
              <AgentRow key={agent.id} record={agent} now={now} />
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default AgentSection;
