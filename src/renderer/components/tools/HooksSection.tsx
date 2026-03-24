/**
 * HooksSection — Collapsible section listing active Claude Code hooks.
 *
 * Reads hooks from window.claude.getHooksConfig() (preload bridge). Falls
 * back gracefully to an empty state with a prompt to browse Discover when
 * the bridge is unavailable or no hooks are configured.
 *
 * Hook lifecycle events: PreToolUse, PostToolUse, PreCompact, Stop, Notification
 */

import React, { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronRight, Webhook, RefreshCw } from "lucide-react";
import { useDiscoverStore } from "../../stores/discover-store";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HookEntry {
  /** Display name of the hook (file basename or configured name). */
  name: string;
  /** Lifecycle event this hook fires on. */
  event: string;
  /** Short description or matcher pattern. */
  description?: string;
  /** Whether the hook is currently enabled. */
  enabled: boolean;
}

// ─── Window API type ──────────────────────────────────────────────────────────

type ClaudeWindow = Window & {
  claude?: {
    getHooksConfig?: () => Promise<HookEntry[]>;
  };
};

// ─── Event badge colours ──────────────────────────────────────────────────────

const EVENT_COLOURS: Record<string, string> = {
  PreToolUse: "bg-violet-900/30 text-violet-400 ring-violet-700/40",
  PostToolUse: "bg-blue-900/30 text-blue-400 ring-blue-700/40",
  PreCompact: "bg-teal-900/30 text-teal-400 ring-teal-700/40",
  Stop: "bg-red-900/20 text-red-400 ring-red-700/30",
  Notification: "bg-amber-900/20 text-amber-400 ring-amber-700/30",
};

function eventClass(event: string): string {
  return (
    EVENT_COLOURS[event] ?? "bg-stone-800 text-stone-400 ring-stone-700/40"
  );
}

// ─── Hook row ─────────────────────────────────────────────────────────────────

const HookRow: React.FC<{ hook: HookEntry }> = ({ hook }) => (
  <div
    className={[
      "flex items-center gap-2 px-3 py-1.5 transition-colors",
      hook.enabled ? "hover:bg-stone-800/30" : "opacity-40",
    ].join(" ")}
  >
    {/* Enabled indicator */}
    <span
      className={`h-1.5 w-1.5 rounded-full shrink-0 ${hook.enabled ? "bg-emerald-400" : "bg-stone-600"}`}
    />

    {/* Name */}
    <span
      className="flex-1 min-w-0 truncate text-stone-300"
      style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace" }}
      title={hook.description ?? hook.name}
    >
      {hook.name}
    </span>

    {/* Event badge */}
    <span
      className={`inline-flex items-center px-1 py-px rounded text-[9px] font-medium ring-1 shrink-0 ${eventClass(hook.event)}`}
      style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
    >
      {hook.event}
    </span>
  </div>
);

// ─── HooksSection ─────────────────────────────────────────────────────────────

const HooksSection: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [hooks, setHooks] = useState<HookEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const setDiscoverOpen = useDiscoverStore((s) => s.setDiscoverOpen);
  const setActiveCategory = useDiscoverStore((s) => s.setActiveCategory);

  const loadHooks = useCallback(async () => {
    setLoading(true);
    const win = window as Window & {
      claude?: {
        getHooksConfig?: () => Promise<HookEntry[]>;
        getInstalledExtensions?: () => Promise<{
          hooks: Array<{ event: string; command: string }>;
        }>;
      };
    };
    try {
      // Try the dedicated hooks API first, fall back to installed extensions
      const result = await win.claude?.getHooksConfig?.();
      if (result && result.length > 0) {
        setHooks(result);
      } else {
        // Fall back to reading hooks from installed extensions
        const ext = await win.claude?.getInstalledExtensions?.();
        if (ext?.hooks && ext.hooks.length > 0) {
          setHooks(
            ext.hooks.map((h, i) => ({
              name:
                h.command
                  .split("/")
                  .pop()
                  ?.replace(/\.js["']?$/g, "")
                  .replace(/["']/g, "") ?? `hook-${i}`,
              event: h.event,
              description: h.command,
              enabled: true,
            })),
          );
        } else {
          setHooks([]);
        }
      }
    } catch {
      setHooks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHooks();
  }, [loadHooks]);

  const handleBrowseHooks = useCallback(() => {
    setActiveCategory("hooks");
    setDiscoverOpen(true);
  }, [setActiveCategory, setDiscoverOpen]);

  const enabledCount = hooks.filter((h) => h.enabled).length;

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
        <Webhook size={11} className="text-[#e8a872] shrink-0" />
        <span
          className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 flex-1 text-left"
          style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
        >
          Hooks
        </span>
        {loading && (
          <RefreshCw
            size={9}
            className="text-stone-600 animate-spin shrink-0"
          />
        )}
        {!loading && hooks.length > 0 && (
          <span
            className="text-stone-600 tabular-nums shrink-0"
            style={{ fontSize: 9, fontFamily: "'Geist Mono', monospace" }}
          >
            {enabledCount}/{hooks.length}
          </span>
        )}
      </button>

      {/* Hook list */}
      {!collapsed && (
        <div className="pb-1">
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-2">
              <RefreshCw
                size={10}
                className="text-stone-600 animate-spin shrink-0"
              />
              <span
                className="text-[10px] text-stone-600"
                style={{ fontFamily: "'Geist Mono', monospace" }}
              >
                Loading hooks...
              </span>
            </div>
          ) : hooks.length === 0 ? (
            <div className="flex flex-col gap-1.5 px-4 py-2">
              <div className="flex items-start gap-2">
                <Webhook size={10} className="text-stone-700 shrink-0 mt-px" />
                <span
                  className="text-[10px] text-stone-600 leading-snug"
                  style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
                >
                  No hooks configured. Add hooks to{" "}
                  <span
                    className="text-stone-500"
                    style={{ fontFamily: "'Geist Mono', monospace" }}
                  >
                    ~/.claude/settings.json
                  </span>
                </span>
              </div>
              <button
                type="button"
                onClick={handleBrowseHooks}
                className="ml-4 text-[10px] text-[#e8a872]/80 hover:text-[#e8a872] transition-colors cursor-pointer text-left"
                style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
              >
                Browse hooks in Discover
              </button>
            </div>
          ) : (
            hooks.map((hook, i) => (
              <HookRow key={`${hook.event}:${hook.name}:${i}`} hook={hook} />
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default HooksSection;
