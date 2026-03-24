/**
 * SwarmMonitorPanel — Agent swarm visualisation panel.
 *
 * Performance-optimized: Uses ref-based record storage with debounced React
 * state updates. CSS animations are static (box-shadow glow, no animate-ping)
 * to avoid GPU thrashing.
 */

import React, {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  Network,
  Bot,
  CheckCircle,
  XCircle,
  Clock,
  Activity,
} from "lucide-react";
import type {
  ToolUseEvent,
  ToolResultEvent,
} from "../../../shared/types/events";

// ─── Types ────────────────────────────────────────────────────────────────

export interface AgentNode {
  id: string;
  name: string;
  role: string;
  status: "active" | "completed" | "failed" | "pending";
  startTime: number;
  endTime?: number;
  children: AgentNode[];
  tokenCount?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function extractNameAndRole(
  input: Record<string, unknown>,
  toolName: string,
): { name: string; role: string } {
  const description =
    typeof input["description"] === "string"
      ? input["description"]
      : typeof input["task"] === "string"
        ? input["task"]
        : typeof input["prompt"] === "string"
          ? input["prompt"]
          : null;

  if (description !== null) {
    const truncated =
      description.length > 60
        ? description.slice(0, 57).trimEnd() + "..."
        : description;
    const role = typeof input["role"] === "string" ? input["role"] : toolName;
    return { name: truncated, role };
  }

  return { name: toolName, role: toolName };
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

// ─── Status dot (static glow, no animate-ping) ───────────────────────────

const StatusDot: React.FC<{ status: AgentNode["status"] }> = ({ status }) => {
  if (status === "active") {
    return (
      <span
        className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400"
        style={{ boxShadow: "0 0 5px 1px rgba(251,191,36,0.4)" }}
      />
    );
  }
  if (status === "completed") {
    return <CheckCircle size={12} className="text-emerald-400 shrink-0" />;
  }
  if (status === "failed") {
    return <XCircle size={12} className="text-red-400 shrink-0" />;
  }
  return <span className="h-2.5 w-2.5 rounded-full bg-zinc-600 shrink-0" />;
};

// ─── Elapsed timer (pure display) ─────────────────────────────────────────

const ElapsedTimer: React.FC<{
  startTime: number;
  endTime?: number;
  now: number;
}> = ({ startTime, endTime, now }) => {
  const elapsed = (endTime ?? now) - startTime;
  return (
    <span
      className="text-zinc-500 text-xs tabular-nums flex items-center gap-0.5"
      style={{ fontFamily: "'Geist Mono', monospace" }}
    >
      <Clock size={10} className="shrink-0" />
      {formatDuration(elapsed)}
    </span>
  );
};

// ─── Agent node card (memoized) ───────────────────────────────────────────

interface AgentNodeCardProps {
  node: AgentNode;
  depth: number;
  now: number;
}

const AgentNodeCard: React.FC<AgentNodeCardProps> = React.memo(
  ({ node, depth, now }) => {
    const borderColor =
      node.status === "active"
        ? "border-amber-500/40"
        : node.status === "completed"
          ? "border-emerald-700/40"
          : node.status === "failed"
            ? "border-red-700/40"
            : "border-zinc-700/40";

    const bgColor =
      node.status === "active"
        ? "bg-amber-950/20"
        : node.status === "completed"
          ? "bg-emerald-950/20"
          : node.status === "failed"
            ? "bg-red-950/20"
            : "bg-zinc-900";

    return (
      <div className="flex flex-col gap-1">
        <div className={`flex items-stretch gap-2 ${depth > 0 ? "ml-4" : ""}`}>
          {depth > 0 && (
            <div className="flex flex-col items-center w-4 shrink-0">
              <div className="w-px flex-1 bg-zinc-700/60" />
              <div className="w-full h-px bg-zinc-700/60 mt-auto mb-3" />
            </div>
          )}

          <div
            className={`flex-1 min-w-0 rounded-md border px-3 py-2 ${borderColor} ${bgColor}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Bot size={12} className="text-zinc-400 shrink-0" />
              <StatusDot status={node.status} />
              <span
                className="text-zinc-200 text-xs font-medium truncate flex-1 min-w-0"
                style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
                title={node.name}
              >
                {node.name}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-1.5">
              <span
                className="text-zinc-500 text-xs px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700/50 truncate max-w-[120px]"
                style={{ fontFamily: "'Geist Mono', monospace" }}
                title={node.role}
              >
                {node.role}
              </span>
              <ElapsedTimer
                startTime={node.startTime}
                endTime={node.endTime}
                now={now}
              />
              {node.tokenCount !== undefined && node.tokenCount > 0 && (
                <span
                  className="text-zinc-600 text-xs tabular-nums ml-auto"
                  style={{ fontFamily: "'Geist Mono', monospace" }}
                >
                  {node.tokenCount.toLocaleString()} tok
                </span>
              )}
            </div>
          </div>
        </div>

        {node.children.length > 0 && (
          <div className={depth > 0 ? "ml-4" : ""}>
            {node.children.map((child) => (
              <AgentNodeCard
                key={child.id}
                node={child}
                depth={depth + 1}
                now={now}
              />
            ))}
          </div>
        )}
      </div>
    );
  },
);

// ─── Tree builder ──────────────────────────────────────────────────────────

const AGENT_TOOL_NAMES = new Set(["Task", "Agent"]);

interface EventRecord {
  useEvent: ToolUseEvent;
  resultEvent?: ToolResultEvent;
}

function buildTree(records: Map<string, EventRecord>): AgentNode[] {
  const nodeMap = new Map<string, AgentNode>();

  for (const [id, record] of records) {
    const { useEvent, resultEvent } = record;
    const { name, role } = extractNameAndRole(
      useEvent.input,
      useEvent.toolName,
    );

    let status: AgentNode["status"] = "active";
    let endTime: number | undefined;

    if (resultEvent !== undefined) {
      status = resultEvent.isError ? "failed" : "completed";
      endTime = resultEvent.timestamp;
    }

    nodeMap.set(id, {
      id,
      name,
      role,
      status,
      startTime: useEvent.timestamp,
      endTime,
      children: [],
    });
  }

  const roots: AgentNode[] = [];
  for (const [id, record] of records) {
    const node = nodeMap.get(id);
    if (!node) continue;

    const parentId = record.useEvent.parentToolUseId;
    if (parentId !== undefined && nodeMap.has(parentId)) {
      nodeMap.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  roots.sort((a, b) => a.startTime - b.startTime);
  for (const root of roots) {
    sortChildren(root);
  }

  return roots;
}

function sortChildren(node: AgentNode): void {
  node.children.sort((a, b) => a.startTime - b.startTime);
  for (const child of node.children) {
    sortChildren(child);
  }
}

// ─── Main panel ───────────────────────────────────────────────────────────

const SwarmMonitorPanel: React.FC = () => {
  // Ref-based storage — mutated directly, flushed to React on schedule
  const recordsRef = useRef<Map<string, EventRecord>>(new Map());
  const [version, setVersion] = useState(0);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const scheduleFlush = useCallback(() => {
    dirty.current = true;
    if (flushTimer.current !== null) return;
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      if (dirty.current) {
        dirty.current = false;
        setVersion((v) => v + 1);
      }
    }, 250);
  }, []);

  useEffect(() => {
    return () => {
      if (flushTimer.current !== null) clearTimeout(flushTimer.current);
    };
  }, []);

  const processOne = useCallback((raw: unknown) => {
    const event = raw as { type?: string };
    if (!event || typeof event !== "object") return;

    if (event.type === "tool_use") {
      const e = raw as ToolUseEvent;
      if (!AGENT_TOOL_NAMES.has(e.toolName)) return;
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

  const handleStreamEvent = useCallback(
    (raw: unknown) => {
      if (Array.isArray(raw)) {
        for (const item of raw) processOne(item);
      } else {
        processOne(raw);
      }
      scheduleFlush();
    },
    [processOne, scheduleFlush],
  );

  useEffect(() => {
    const win = window as unknown as {
      claude?: {
        onStreamEvent?: (cb: (event: unknown) => void) => () => void;
      };
    };

    if (win.claude?.onStreamEvent) {
      return win.claude.onStreamEvent(handleStreamEvent);
    }

    const domHandler = (e: Event) => {
      handleStreamEvent((e as CustomEvent<unknown>).detail);
    };
    window.addEventListener("claude:stream-event", domHandler);
    return () => window.removeEventListener("claude:stream-event", domHandler);
  }, [handleStreamEvent]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const roots = useMemo(() => buildTree(recordsRef.current), [version]);

  const activeCount = useMemo(
    () => roots.reduce((acc, r) => acc + countActive(r), 0),
    [roots],
  );

  // Single shared timer — 5s when active agents exist
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (activeCount === 0) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, [activeCount]);

  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden"
      style={{
        backgroundColor: "#09090b",
        fontFamily: "'Geist', system-ui, sans-serif",
      }}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <Network size={14} className="text-amber-500 shrink-0" />
          <span className="text-zinc-300 text-sm font-medium tracking-wide">
            Agent Swarm
          </span>
        </div>

        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-950/40 border border-amber-700/40">
              <Activity size={10} className="text-amber-400 shrink-0" />
              <span
                className="text-amber-300 text-xs tabular-nums"
                style={{ fontFamily: "'Geist Mono', monospace" }}
              >
                {activeCount} active
              </span>
            </div>
          )}
          {recordsRef.current.size > 0 && (
            <span
              className="text-zinc-600 text-xs tabular-nums"
              style={{ fontFamily: "'Geist Mono', monospace" }}
            >
              {recordsRef.current.size} total
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
        {roots.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-8">
            <div className="p-3 rounded-full bg-zinc-800/60 border border-zinc-700/40">
              <Network size={22} className="text-zinc-600" />
            </div>
            <div className="text-center max-w-xs">
              <p className="text-zinc-400 text-sm font-medium mb-1">
                Monitoring for agent activity
              </p>
              <p
                className="text-zinc-600 text-xs leading-relaxed"
                style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
              >
                When Claude Code spawns parallel agents for complex tasks, they
                will appear here as a live tree.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {roots.map((root) => (
              <AgentNodeCard key={root.id} node={root} depth={0} now={now} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function countActive(node: AgentNode): number {
  let count = node.status === "active" ? 1 : 0;
  for (const child of node.children) {
    count += countActive(child);
  }
  return count;
}

export default SwarmMonitorPanel;
