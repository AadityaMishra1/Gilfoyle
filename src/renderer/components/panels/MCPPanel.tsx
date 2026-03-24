/**
 * MCPPanel — Model Context Protocol server status panel.
 *
 * Lists all configured MCP servers as a minimal, scannable list.
 * Each row shows a status dot, server name, and tool count badge.
 * Clicking a row with tools expands an indented tool list.
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  Plug,
  Shield,
  ChevronDown,
  ChevronRight,
  Wrench,
  Loader2,
} from "lucide-react";
import { useMCPStore } from "../../stores/mcp-store";
import type { MCPServerStatus } from "../../../shared/types/mcp";
import type { MCPTool } from "../../../shared/types/mcp";

// ─── Window API type ──────────────────────────────────────────────────────────

type ClaudeWindow = Window & {
  claude?: {
    getMcpStatus?: () => Promise<MCPServerStatus[]>;
  };
};

// ─── Status helpers ────────────────────────────────────────────────────────

type ServerStatus = MCPServerStatus["status"];

interface StatusConfig {
  dotClass: string;
  glowClass: string;
  label: string;
  pulse: boolean;
}

const STATUS_CONFIG: Record<ServerStatus, StatusConfig> = {
  connected: {
    dotClass: "bg-emerald-400",
    glowClass: "shadow-[0_0_6px_1px_rgba(52,211,153,0.5)]",
    label: "connected",
    pulse: false,
  },
  "needs-auth": {
    dotClass: "bg-amber-400",
    glowClass: "shadow-[0_0_6px_1px_rgba(251,191,36,0.5)]",
    label: "needs auth",
    pulse: true,
  },
  error: {
    dotClass: "bg-red-400",
    glowClass: "shadow-[0_0_6px_1px_rgba(248,113,113,0.4)]",
    label: "error",
    pulse: false,
  },
  disconnected: {
    dotClass: "bg-zinc-600",
    glowClass: "",
    label: "disconnected",
    pulse: false,
  },
};

// ─── Status dot ───────────────────────────────────────────────────────────

interface StatusDotProps {
  status: ServerStatus;
}

const StatusDot: React.FC<StatusDotProps> = ({ status }) => {
  const cfg = STATUS_CONFIG[status];

  if (cfg.pulse) {
    return (
      <span
        className={`inline-flex shrink-0 h-1.5 w-1.5 rounded-full ${cfg.dotClass} ${cfg.glowClass}`}
      />
    );
  }

  return (
    <span
      className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dotClass} ${cfg.glowClass}`}
    />
  );
};

// ─── Tool count badge ─────────────────────────────────────────────────────

interface ToolCountBadgeProps {
  count: number;
}

const ToolCountBadge: React.FC<ToolCountBadgeProps> = ({ count }) => (
  <span
    className="inline-flex items-center gap-1 px-1.5 py-px rounded text-[9px] font-medium
      bg-zinc-800 text-zinc-500 ring-1 ring-zinc-700/50 tabular-nums"
    style={{ fontFamily: "'Geist Mono', 'Fira Code', monospace" }}
  >
    <Wrench size={8} className="text-zinc-600 shrink-0" />
    {count}
  </span>
);

// ─── Tool row ─────────────────────────────────────────────────────────────

interface ToolRowProps {
  tool: MCPTool;
}

const ToolRow: React.FC<ToolRowProps> = ({ tool }) => (
  <div className="flex items-start gap-2 pl-[36px] pr-3 py-1 hover:bg-zinc-800/20 transition-colors">
    <Wrench size={10} className="text-zinc-700 shrink-0 mt-px" />
    <div className="flex flex-col min-w-0">
      <span
        className="text-[11px] text-zinc-500 truncate leading-tight"
        style={{ fontFamily: "'Geist Mono', 'Fira Code', monospace" }}
      >
        {tool.name}
      </span>
      {tool.description !== undefined && (
        <span
          className="text-[10px] text-zinc-700 truncate leading-snug"
          title={tool.description}
        >
          {tool.description}
        </span>
      )}
    </div>
  </div>
);

// ─── Server row ───────────────────────────────────────────────────────────

interface ServerRowProps {
  server: MCPServerStatus;
  tools: MCPTool[];
}

const ServerRow: React.FC<ServerRowProps> = ({ server, tools }) => {
  const [expanded, setExpanded] = useState(false);

  const hasTools = server.toolCount > 0 || tools.length > 0;
  const displayTools = tools.length > 0 ? tools : [];

  const toggle = useCallback(() => {
    if (hasTools) setExpanded((prev) => !prev);
  }, [hasTools]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    },
    [toggle],
  );

  const cfg = STATUS_CONFIG[server.status];

  return (
    <div>
      {/* ── Server summary row ──────────────────────────────────── */}
      <button
        type="button"
        className={[
          "w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors",
          hasTools ? "cursor-pointer hover:bg-zinc-800/50" : "cursor-default",
        ].join(" ")}
        onClick={toggle}
        onKeyDown={handleKeyDown}
        aria-expanded={hasTools ? expanded : undefined}
      >
        {/* Expand indicator */}
        <span className="shrink-0 w-3 flex items-center justify-center text-zinc-700">
          {hasTools ? (
            expanded ? (
              <ChevronDown size={11} />
            ) : (
              <ChevronRight size={11} />
            )
          ) : null}
        </span>

        {/* Status dot */}
        <StatusDot status={server.status} />

        {/* Server name */}
        <span
          className="flex-1 min-w-0 truncate text-xs font-medium text-zinc-300"
          title={server.name}
        >
          {server.name}
        </span>

        {/* Status label — only when not connected */}
        {server.status !== "connected" && (
          <span
            className={[
              "shrink-0 text-[9px] font-medium uppercase tracking-wider",
              server.status === "needs-auth"
                ? "text-amber-500/80"
                : server.status === "error"
                  ? "text-red-500/80"
                  : "text-zinc-600",
            ].join(" ")}
          >
            {cfg.label}
          </span>
        )}

        {/* Tool count badge */}
        {server.toolCount > 0 && <ToolCountBadge count={server.toolCount} />}
      </button>

      {/* ── Error message ─────────────────────────────────────── */}
      {server.status === "error" && server.error !== undefined && (
        <div className="mx-3 mb-1 px-2.5 py-1.5 rounded bg-red-950/20 border border-red-900/30">
          <p
            className="text-[10px] text-red-400/90 leading-snug break-all"
            style={{ fontFamily: "'Geist Mono', 'Fira Code', monospace" }}
          >
            {server.error}
          </p>
        </div>
      )}

      {/* ── Auth notice ───────────────────────────────────────── */}
      {server.status === "needs-auth" && (
        <div className="mx-3 mb-1 flex items-center gap-2 px-2.5 py-1.5 rounded bg-amber-950/20 border border-amber-900/30">
          <Shield size={10} className="text-amber-500 shrink-0" />
          <p
            className="text-[10px] text-amber-400/80 leading-snug"
            style={{ fontFamily: "'Geist Mono', 'Fira Code', monospace" }}
          >
            Auth required — run Claude Code to complete the flow.
          </p>
        </div>
      )}

      {/* ── Tool list (expanded) ──────────────────────────────── */}
      {expanded && hasTools && (
        <div className="pb-1">
          {displayTools.length > 0 ? (
            displayTools.map((tool) => (
              <ToolRow key={`${tool.server}:${tool.name}`} tool={tool} />
            ))
          ) : (
            /* Count known, details not yet loaded */
            <div className="flex items-center gap-2 pl-[36px] pr-3 py-1">
              <Wrench size={10} className="text-zinc-700 shrink-0" />
              <span
                className="text-[11px] text-zinc-600"
                style={{ fontFamily: "'Geist Mono', 'Fira Code', monospace" }}
              >
                {server.toolCount} tool{server.toolCount !== 1 ? "s" : ""}{" "}
                available
              </span>
            </div>
          )}
        </div>
      )}

      {/* Separator */}
      <div className="mx-3 border-b border-zinc-800/60 last:border-0" />
    </div>
  );
};

// ─── Empty state ──────────────────────────────────────────────────────────

const EmptyState: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full gap-3 py-10 px-4">
    <div className="p-2.5 rounded-full bg-zinc-800/50 ring-1 ring-zinc-700/40">
      <Plug size={18} className="text-zinc-600" />
    </div>
    <div className="text-center">
      <p className="text-xs font-medium text-zinc-400 mb-1.5">
        No MCP servers found
      </p>
      <p
        className="text-[10px] text-zinc-600 leading-relaxed"
        style={{ fontFamily: "'Geist Mono', 'Fira Code', monospace" }}
      >
        Add MCP servers in{" "}
        <span className="text-zinc-500">~/.claude/settings.json</span> or via{" "}
        <span className="text-zinc-500">claude mcp add</span>
      </p>
    </div>
  </div>
);

// ─── Loading state ─────────────────────────────────────────────────────────

const LoadingState: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full gap-2 py-10">
    <Loader2 size={16} className="text-zinc-600 animate-spin" />
    <p
      className="text-[10px] text-zinc-600"
      style={{ fontFamily: "'Geist Mono', 'Fira Code', monospace" }}
    >
      Fetching MCP status...
    </p>
  </div>
);

// ─── Main panel ───────────────────────────────────────────────────────────

const MCPPanel: React.FC = () => {
  const servers = useMCPStore((s) => s.servers);
  const setServers = useMCPStore((s) => s.setServers);
  const [loading, setLoading] = useState(true);

  // Fetch MCP status on mount when the store is empty.
  useEffect(() => {
    const win = window as ClaudeWindow;
    if (!win.claude?.getMcpStatus) {
      // Bridge not available yet — skip loading indicator after a moment.
      const timer = setTimeout(() => setLoading(false), 500);
      return () => clearTimeout(timer);
    }

    setLoading(true);
    win.claude
      .getMcpStatus()
      .then((result) => {
        setServers(result ?? []);
      })
      .catch(() => {
        // Best-effort — show empty state on failure.
      })
      .finally(() => {
        setLoading(false);
      });
  }, [setServers]);

  // Individual tool descriptors are not yet populated from IPC — pass empty
  // arrays and let ServerRow fall back to count-based display.
  const emptyTools: MCPTool[] = [];

  const connectedCount = servers.filter((s) => s.status === "connected").length;
  const needsAuthCount = servers.filter(
    (s) => s.status === "needs-auth",
  ).length;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-zinc-900">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2.5 border-b border-zinc-800/80 shrink-0">
        <Plug size={13} className="text-amber-400 shrink-0" />
        <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
          MCP Servers
        </span>

        <div className="ml-auto flex items-center gap-2">
          {loading && (
            <Loader2
              size={10}
              className="text-zinc-600 animate-spin shrink-0"
            />
          )}
          {needsAuthCount > 0 && (
            <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-500/80">
              {needsAuthCount} auth
            </span>
          )}
          {servers.length > 0 && (
            <span
              className="text-[10px] text-zinc-700 tabular-nums"
              style={{ fontFamily: "'Geist Mono', 'Fira Code', monospace" }}
            >
              {connectedCount}/{servers.length}
            </span>
          )}
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <LoadingState />
        ) : servers.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="py-1">
            {servers.map((server) => (
              <ServerRow key={server.name} server={server} tools={emptyTools} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MCPPanel;
