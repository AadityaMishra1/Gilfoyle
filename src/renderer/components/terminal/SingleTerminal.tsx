import React, { useEffect, useRef, useCallback } from "react";
import { useTerminal } from "../../hooks/use-terminal";
import { useClaudeAPI } from "../../hooks/use-ipc";

// ─── Types ─────────────────────────────────────────────────────────────────

interface SingleTerminalProps {
  /** PTY session ID assigned by the main process. */
  sessionId: string;
  /** When false the container is hidden but the PTY and scrollback stay alive. */
  isVisible: boolean;
  /** Called with the exit code when the PTY process exits. */
  onExit?: (exitCode: number) => void;
}

// ─── Component ─────────────────────────────────────────────────────────────

/**
 * A single xterm.js terminal wired to a live PTY session.
 *
 * Visibility is controlled via CSS display so that hidden terminals keep their
 * PTY process and xterm scrollback intact. The component re-fits and focuses
 * whenever it becomes visible.
 */
const SingleTerminal: React.FC<SingleTerminalProps> = ({
  sessionId,
  isVisible,
  onExit,
}) => {
  const claude = useClaudeAPI();
  const { containerRef, terminal, fitAddon, fit } = useTerminal();

  // Keep mutable refs so closures always see the latest values without
  // causing effect re-runs.
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

  // ─── Wire PTY I/O once xterm is ready ─────────────────────────────────
  useEffect(() => {
    if (!terminal) return;

    // Show welcome banner and flush any early-buffered data.
    // Terminals now stay alive across project switches (visibility:hidden),
    // so no scrollback replay is needed.
    terminal.write(
      "\x1b[2m  Welcome to Gilfoyle\x1b[0m\r\n" +
        "\x1b[2m  Type \x1b[0m\x1b[33mclaude\x1b[0m\x1b[2m to start a session, or any shell command.\x1b[0m\r\n\r\n",
    );
    terminal.focus();

    // Flush any data that arrived before terminal was ready.
    if (earlyDataBuffer.current.length > 0) {
      for (const chunk of earlyDataBuffer.current) {
        terminal.write(chunk);
      }
      earlyDataBuffer.current = [];
    }
    terminalReady.current = true;

    // Keystrokes in xterm -> PTY input
    const onDataDispose = terminal.onData((data: string) => {
      claude.sendInput(sessionIdRef.current, data).catch((err: unknown) => {
        console.error("[SingleTerminal] sendInput error:", err);
      });
    });

    // PTY output -> xterm write (filter by sessionId)
    const removePtyData = claude.onPtyData((payload) => {
      if (payload.sessionId !== sessionIdRef.current) return;
      terminal.write(payload.data);
    });

    // PTY exit -> show banner, notify parent
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

      onExitRef.current?.(code);
    });

    return () => {
      terminalReady.current = false;
      onDataDispose.dispose();
      removePtyData();
      removePtyExit();
    };
  }, [terminal, claude]);

  // ─── Fit on container resize ───────────────────────────────────────────
  const handleResize = useCallback(() => {
    if (!fitAddon || !terminal) return;
    fit();
    const { cols, rows } = terminal;
    // Guard against tiny dimensions (container not yet laid out or hidden).
    if (cols < 10 || rows < 3) {
      setTimeout(() => {
        if (!fitAddon || !terminal) return;
        fit();
        const c = terminal.cols;
        const r = terminal.rows;
        if (c >= 10 && r >= 3) {
          claude.resizeSession(sessionIdRef.current, c, r).catch(() => {});
        }
      }, 150);
      return;
    }
    claude
      .resizeSession(sessionIdRef.current, cols, rows)
      .catch((err: unknown) => {
        console.error("[SingleTerminal] resizeSession error:", err);
      });
  }, [fitAddon, terminal, fit, claude]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(handleResize);
    });
    observer.observe(container);
    requestAnimationFrame(handleResize);

    return () => observer.disconnect();
  }, [containerRef, handleResize]);

  // ─── Re-fit and focus when tab becomes visible ─────────────────────────
  useEffect(() => {
    if (isVisible && terminal && fitAddon) {
      requestAnimationFrame(() => {
        handleResize();
        terminal.focus();
      });
    }
  }, [isVisible, terminal, fitAddon, handleResize]);

  // ─── Cmd/Ctrl+F: pull focus back to terminal ──────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
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
      className="flex-1 min-h-0 min-w-0 w-full h-full overflow-hidden"
      style={{
        display: isVisible ? "flex" : "none",
        flexDirection: "column",
        backgroundColor: "var(--bg-terminal)",
        transition: "background-color 0.2s ease",
      }}
      tabIndex={0}
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

export default SingleTerminal;
