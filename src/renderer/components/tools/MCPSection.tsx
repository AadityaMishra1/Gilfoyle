/**
 * MCPSection — Collapsible section showing MCP server status within the
 * ToolsPanel. Simplified from MCPPanel: no standalone header chrome,
 * just the server list with status dots and tool counts.
 */

import React, { useState, useCallback } from "react";
import { Plug, ChevronDown, ChevronRight, Wrench, Shield } from "lucide-react";
import { useMCPStore } from "../../stores/mcp-store";
import type { MCPServerStatus } from "../../../shared/types/mcp";

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_DOT: Record<MCPServerStatus["status"], string> = {
  connected: "bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.5)]",
  "needs-auth": "bg-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.5)]",
  error: "bg-red-400 shadow-[0_0_5px_rgba(248,113,113,0.4)]",
  disconnected: "bg-stone-600",
};

// ─── Status dot ───────────────────────────────────────────────────────────────

const StatusDot: React.FC<{ status: MCPServerStatus["status"] }> = ({
  status,
}) => {
  if (status === "needs-auth") {
    return (
      <span
        className="inline-flex shrink-0 h-1.5 w-1.5 rounded-full bg-amber-400"
        style={{ boxShadow: "0 0 4px 1px rgba(251,191,36,0.4)" }}
      />
    );
  }
  return (
    <span
      className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_DOT[status]}`}
    />
  );
};

// ─── Server row ───────────────────────────────────────────────────────────────

interface ServerRowProps {
  server: MCPServerStatus;
}

const ServerRow: React.FC<ServerRowProps> = ({ server }) => {
  const [expanded, setExpanded] = useState(false);
  const hasTools = server.toolCount > 0;

  const toggle = useCallback(() => {
    if (hasTools) setExpanded((p) => !p);
  }, [hasTools]);

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className={[
          "w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors",
          hasTools ? "cursor-pointer hover:bg-stone-800/50" : "cursor-default",
        ].join(" ")}
        aria-expanded={hasTools ? expanded : undefined}
      >
        <span className="shrink-0 w-3 flex items-center justify-center text-stone-600">
          {hasTools ? (
            expanded ? (
              <ChevronDown size={10} />
            ) : (
              <ChevronRight size={10} />
            )
          ) : null}
        </span>
        <StatusDot status={server.status} />
        <span
          className="flex-1 min-w-0 truncate text-[11px] text-stone-300"
          title={server.name}
          style={{ fontFamily: "'Geist Mono', monospace" }}
        >
          {server.name}
        </span>
        {server.status === "needs-auth" && (
          <Shield size={9} className="text-amber-500 shrink-0" />
        )}
        {server.status === "error" && (
          <span className="text-[9px] text-red-400 font-medium shrink-0">
            ERR
          </span>
        )}
        {server.toolCount > 0 && (
          <span
            className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[9px] font-medium
              bg-stone-800 text-stone-500 ring-1 ring-stone-700/50 tabular-nums shrink-0"
            style={{ fontFamily: "'Geist Mono', monospace" }}
          >
            <Wrench size={7} className="text-stone-600" />
            {server.toolCount}
          </span>
        )}
      </button>

      {/* Auth notice */}
      {server.status === "needs-auth" && (
        <div className="mx-3 mb-1 flex items-center gap-1.5 px-2 py-1 rounded bg-amber-950/20 border border-amber-900/30">
          <Shield size={9} className="text-amber-500 shrink-0" />
          <span
            className="text-[9px] text-amber-400/80"
            style={{ fontFamily: "'Geist Mono', monospace" }}
          >
            Auth required — run claude mcp auth
          </span>
        </div>
      )}

      {/* Error message */}
      {server.status === "error" && server.error !== undefined && (
        <div className="mx-3 mb-1 px-2 py-1 rounded bg-red-950/20 border border-red-900/30">
          <p
            className="text-[9px] text-red-400/90 break-all leading-snug"
            style={{ fontFamily: "'Geist Mono', monospace" }}
          >
            {server.error}
          </p>
        </div>
      )}

      {/* Tool count summary (expanded) */}
      {expanded && hasTools && (
        <div className="pl-8 pr-3 pb-1 flex items-center gap-1.5 text-stone-600">
          <Wrench size={9} className="shrink-0" />
          <span
            className="text-[10px]"
            style={{ fontFamily: "'Geist Mono', monospace" }}
          >
            {server.toolCount} tool{server.toolCount !== 1 ? "s" : ""} available
          </span>
        </div>
      )}

      <div className="mx-3 border-b border-stone-800/60 last:border-0" />
    </div>
  );
};

// ─── MCPSection ───────────────────────────────────────────────────────────────

const MCPSection: React.FC = () => {
  const servers = useMCPStore((s) => s.servers);
  const [collapsed, setCollapsed] = useState(false);

  const connectedCount = servers.filter((s) => s.status === "connected").length;

  return (
    <div className="border-b border-stone-800">
      {/* Section header */}
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
        <Plug size={11} className="text-[#e8a872] shrink-0" />
        <span
          className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 flex-1 text-left"
          style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
        >
          MCP Servers
        </span>
        {servers.length > 0 && (
          <span
            className="text-[9px] text-stone-600 tabular-nums"
            style={{ fontFamily: "'Geist Mono', monospace" }}
          >
            {connectedCount}/{servers.length}
          </span>
        )}
      </button>

      {/* Server list */}
      {!collapsed && (
        <div className="pb-1">
          {servers.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-2">
              <span
                className="text-[10px] text-stone-600"
                style={{ fontFamily: "'Geist Mono', monospace" }}
              >
                No MCP servers configured
              </span>
            </div>
          ) : (
            servers.map((server) => (
              <ServerRow key={server.name} server={server} />
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default MCPSection;
