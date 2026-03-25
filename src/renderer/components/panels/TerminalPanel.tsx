import React, { useEffect, useRef, useCallback } from "react";
import { Plus, X } from "lucide-react";
import { useTerminal } from "../../hooks/use-terminal";
import { useClaudeAPI } from "../../hooks/use-ipc";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface TerminalTab {
  sessionId: string;
  name: string;
  cwd: string;
  isActive: boolean;
}

interface TerminalPanelProps {
  tabs: TerminalTab[];
  activeTabId: string | null;
  onTabSelect: (sessionId: string) => void;
  onTabClose: (sessionId: string) => void;
  onNewTab: () => void;
  onTabExit?: (sessionId: string, exitCode: number) => void;
}

// ─── Single terminal instance (one per tab, kept alive while hidden) ───────

interface SingleTerminalProps {
  sessionId: string;
  isVisible: boolean;
  onExit?: (sessionId: string, exitCode: number) => void;
}

const SingleTerminal: React.FC<SingleTerminalProps> = ({
  sessionId,
  isVisible,
  onExit,
}) => {
  const claude = useClaudeAPI();
  const { containerRef, terminal, fitAddon, fit } = useTerminal();

  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  // Buffer PTY data that arrives before xterm.js is ready to render.
  // This prevents losing early shell output (prompt, motd, etc.).
  const earlyDataBuffer = useRef<string[]>([]);
  const terminalReady = useRef(false);

  // Start listening for PTY data immediately (before terminal is ready).
  // Buffer any data that arrives early and flush once terminal is wired.
  useEffect(() => {
    const removePtyData = claude.onPtyData((payload) => {
      if (payload.sessionId !== sessionIdRef.current) return;
      if (terminalReady.current) return; // handled by the wired effect
      earlyDataBuffer.current.push(payload.data);
    });

    return () => {
      removePtyData();
    };
  }, [claude]);

  // ─── Wire PTY I/O once terminal is ready ─────────────────────────────
  useEffect(() => {
    if (!terminal) return;

    // Flush any buffered data that arrived before terminal was ready
    if (earlyDataBuffer.current.length > 0) {
      for (const chunk of earlyDataBuffer.current) {
        terminal.write(chunk);
      }
      earlyDataBuffer.current = [];
    }
    terminalReady.current = true;

    const onDataDispose = terminal.onData((data: string) => {
      claude.sendInput(sessionIdRef.current, data).catch((err: unknown) => {
        console.error("[TerminalPanel] sendInput error:", err);
      });
    });

    const removePtyData = claude.onPtyData((payload) => {
      if (payload.sessionId !== sessionIdRef.current) return;
      terminal.write(payload.data);
    });

    const removePtyExit = claude.onPtyExit((payload) => {
      if (payload.sessionId !== sessionIdRef.current) return;

      const code = payload.exitCode;
      const color = code === 0 ? "\x1b[32m" : "\x1b[31m";
      const reset = "\x1b[0m";
      const dim = "\x1b[2m";

      terminal.write(
        `\r\n${dim}─────────────────────────────────────────────${reset}\r\n` +
          `${color}[Session ended]${reset}${dim} exit code ${code}${reset}\r\n`,
      );

      onExitRef.current?.(sessionIdRef.current, code);
    });

    return () => {
      terminalReady.current = false;
      onDataDispose.dispose();
      removePtyData();
      removePtyExit();
    };
  }, [terminal, claude]);

  // ─── ResizeObserver: fit terminal whenever the container changes ──────
  const handleResize = useCallback(() => {
    if (!fitAddon || !terminal) return;
    fit();
    const cols = terminal.cols;
    const rows = terminal.rows;
    if (cols > 0 && rows > 0) {
      claude
        .resizeSession(sessionIdRef.current, cols, rows)
        .catch((err: unknown) => {
          console.error("[TerminalPanel] resizeSession error:", err);
        });
    }
  }, [fitAddon, terminal, fit, claude]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(handleResize);
    });

    observer.observe(container);
    requestAnimationFrame(handleResize);

    return () => {
      observer.disconnect();
    };
  }, [containerRef, handleResize]);

  // ─── Re-fit when tab becomes visible ─────────────────────────────────
  useEffect(() => {
    if (isVisible && terminal && fitAddon) {
      requestAnimationFrame(() => {
        handleResize();
        terminal.scrollToBottom();
        terminal.focus();
      });
    }
  }, [isVisible, terminal, fitAddon, handleResize]);

  // ─── Welcome message once terminal mounts ────────────────────────────
  useEffect(() => {
    if (!terminal) return;
    terminal.write(
      "\x1b[2m  Welcome to Gilfoyle\x1b[0m\r\n" +
        "\x1b[2m  Type \x1b[0m\x1b[33mclaude\x1b[0m\x1b[2m to start a session, or any shell command.\x1b[0m\r\n\r\n",
    );
    terminal.focus();
  }, [terminal]);

  // ─── Cmd+F: focus terminal ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        terminal?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [terminal]);

  return (
    <div
      className="flex-1 min-h-0 min-w-0 w-full h-full overflow-hidden flex flex-col"
      style={{ backgroundColor: "#09090b" }}
      tabIndex={isVisible ? 0 : -1}
      onFocus={() => terminal?.focus()}
    >
      <div
        ref={containerRef}
        className="flex-1 w-full h-full min-h-0 min-w-0"
        style={{ padding: "6px 8px", overflow: "hidden" }}
        aria-label="Terminal"
        role="region"
      />
    </div>
  );
};

// ─── Tab bar ──────────────────────────────────────────────────────────────

interface TabBarProps {
  tabs: TerminalTab[];
  activeTabId: string | null;
  onTabSelect: (sessionId: string) => void;
  onTabClose: (sessionId: string) => void;
  onNewTab: () => void;
}

const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onNewTab,
}) => {
  return (
    <div
      className="flex items-center shrink-0 overflow-x-auto"
      style={{
        height: 34,
        backgroundColor: "var(--bg-secondary, #18181b)",
        borderBottom: "1px solid rgba(120,113,108,0.2)",
      }}
      role="tablist"
      aria-label="Terminal sessions"
    >
      {tabs.map((tab) => {
        const isActive = tab.sessionId === activeTabId;

        return (
          <button
            key={tab.sessionId}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabSelect(tab.sessionId)}
            className={[
              "group relative flex items-center gap-1.5 px-3 h-full shrink-0",
              "text-xs select-none transition-colors duration-100 max-w-[160px]",
              "border-r border-stone-800/50",
              isActive
                ? "bg-zinc-900 text-stone-200"
                : "text-stone-500 hover:text-stone-300 hover:bg-zinc-800/60",
            ].join(" ")}
            style={{
              borderBottom: isActive
                ? "2px solid #e8a872"
                : "2px solid transparent",
              fontFamily: "'Geist Mono', monospace",
              fontSize: 11,
            }}
          >
            {/* Active indicator dot */}
            {tab.isActive && (
              <span
                className="shrink-0 rounded-full bg-emerald-400"
                style={{ width: 5, height: 5 }}
                aria-label="Running"
              />
            )}

            {/* Session name */}
            <span className="truncate" title={tab.name}>
              {tab.name}
            </span>

            {/* Close button */}
            <span
              role="button"
              tabIndex={0}
              aria-label={`Close ${tab.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.sessionId);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onTabClose(tab.sessionId);
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
        className="flex items-center justify-center px-2.5 h-full shrink-0 text-stone-600 hover:text-amber-400 hover:bg-zinc-800/60 transition-colors"
      >
        <Plus size={12} strokeWidth={2} />
      </button>
    </div>
  );
};

// ─── Main panel ───────────────────────────────────────────────────────────

/**
 * Multi-session terminal panel.
 *
 * Renders a tab bar above the terminal area. Each tab maps to one PTY session.
 * Terminals that are not currently active are hidden (display:none) but kept
 * alive so their scrollback and process state are preserved.
 */
const TerminalPanel: React.FC<TerminalPanelProps> = ({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onNewTab,
  onTabExit,
}) => {
  if (tabs.length === 0) {
    return (
      <div
        className="flex flex-col w-full h-full overflow-hidden"
        style={{ backgroundColor: "#09090b" }}
      >
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onTabSelect={onTabSelect}
          onTabClose={onTabClose}
          onNewTab={onNewTab}
        />
        <div className="flex-1 flex items-center justify-center">
          <span className="text-stone-600 text-xs">
            No session. Click + to open one.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col w-full h-full overflow-hidden"
      style={{ backgroundColor: "#09090b" }}
    >
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={onTabSelect}
        onTabClose={onTabClose}
        onNewTab={onNewTab}
      />

      {/* Terminal instances — all mounted, inactive ones use visibility:hidden
           so xterm.js can still measure dimensions (display:none breaks FitAddon). */}
      <div className="flex-1 min-h-0 min-w-0 relative">
        {tabs.map((tab) => {
          const isActive = tab.sessionId === activeTabId;
          return (
            <div
              key={tab.sessionId}
              className="absolute inset-0"
              style={{
                visibility: isActive ? "visible" : "hidden",
                pointerEvents: isActive ? "auto" : "none",
                zIndex: isActive ? 1 : 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <SingleTerminal
                sessionId={tab.sessionId}
                isVisible={tab.sessionId === activeTabId}
                onExit={onTabExit}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TerminalPanel;
