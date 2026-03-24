import React, { useRef } from "react";
import { Plus, X } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface TerminalTab {
  /** PTY session ID — used as the stable React key and for IPC calls. */
  id: string;
  /** Display label shown in the tab, e.g. "Session 1". */
  name: string;
  /** Whether the underlying PTY process is still running. */
  isRunning: boolean;
  /** Absolute working directory of the session. */
  cwd: string;
}

interface TerminalTabBarProps {
  tabs: TerminalTab[];
  activeTabId: string;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onNewTab: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────

/**
 * Horizontal tab bar for the terminal area.
 *
 * - 28 px tall, stone-900 background.
 * - Active tab: 2 px peach (#e8a872) bottom border, stone-100 text.
 * - Inactive tab: stone-500 text, hover stone-300.
 * - Each tab capped at 160 px wide with truncated names.
 * - Scrollable horizontally when tabs overflow.
 * - "+" button at the right edge opens a new session.
 */
const TerminalTabBar: React.FC<TerminalTabBarProps> = ({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onNewTab,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={scrollRef}
      className="flex items-center shrink-0 overflow-x-auto"
      style={{
        height: 28,
        backgroundColor: "var(--bg-primary)",
        borderBottom: "1px solid var(--border-subtle)",
        transition: "background-color 0.2s ease",
        // Hide the scrollbar visually while keeping scroll functionality.
        scrollbarWidth: "none",
      }}
      role="tablist"
      aria-label="Terminal sessions"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            title={tab.cwd}
            onClick={() => onTabSelect(tab.id)}
            className={[
              "group relative flex items-center gap-1.5 px-3 h-full shrink-0",
              "text-xs select-none transition-colors duration-100",
              "border-r border-stone-800/50",
              isActive
                ? "text-stone-100 bg-stone-800/40"
                : "text-stone-500 hover:text-stone-300 hover:bg-stone-800/30",
            ].join(" ")}
            style={{
              maxWidth: 160,
              borderBottom: isActive
                ? "2px solid var(--accent-primary)"
                : "2px solid transparent",
              fontFamily: "'Geist Mono', monospace",
              fontSize: 11,
            }}
          >
            {/* Running indicator dot */}
            {tab.isRunning && (
              <span
                className="shrink-0 rounded-full bg-emerald-400"
                style={{ width: 5, height: 5 }}
                aria-label="Running"
              />
            )}

            {/* Session name */}
            <span className="truncate flex-1 text-left" title={tab.name}>
              {tab.name}
            </span>

            {/* Close button */}
            <span
              role="button"
              tabIndex={0}
              aria-label={`Close ${tab.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onTabClose(tab.id);
                }
              }}
              className={[
                "shrink-0 rounded p-0.5 transition-colors",
                "opacity-0 group-hover:opacity-100",
                "hover:bg-stone-700/60 hover:text-stone-200",
                isActive ? "opacity-60" : "",
              ].join(" ")}
            >
              <X size={9} strokeWidth={2} />
            </span>
          </button>
        );
      })}

      {/* New session button */}
      <button
        type="button"
        aria-label="New session (Cmd+N)"
        title="New session (Cmd+N)"
        onClick={onNewTab}
        className="flex items-center justify-center px-2.5 h-full shrink-0 text-stone-600 hover:text-amber-400 hover:bg-stone-800/30 transition-colors"
      >
        <Plus size={11} strokeWidth={2} />
      </button>
    </div>
  );
};

export default TerminalTabBar;
