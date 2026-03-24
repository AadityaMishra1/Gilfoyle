import React, { useEffect, useCallback, useRef, useReducer } from "react";
import { useClaudeAPI } from "../../hooks/use-ipc";
import TerminalTabBar from "./TerminalTabBar";
import SingleTerminal from "./SingleTerminal";
import type { TerminalTab } from "./TerminalTabBar";

// ─── Types ─────────────────────────────────────────────────────────────────

interface TerminalAreaProps {
  /** Absolute path that new sessions will cd into. */
  projectPath: string;
  /** Optional external trigger for opening an additional tab. */
  onNewSession?: () => void;
}

// ─── State management ──────────────────────────────────────────────────────

type Action =
  | { type: "ADD_TAB"; tab: TerminalTab }
  | { type: "REMOVE_TAB"; id: string }
  | { type: "SET_ACTIVE"; id: string }
  | { type: "SET_RUNNING"; id: string; isRunning: boolean };

interface State {
  tabs: TerminalTab[];
  activeTabId: string;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD_TAB": {
      return {
        tabs: [...state.tabs, action.tab],
        activeTabId: action.tab.id,
      };
    }

    case "REMOVE_TAB": {
      const remaining = state.tabs.filter((t) => t.id !== action.id);
      if (remaining.length === 0) {
        return { tabs: [], activeTabId: "" };
      }
      // Switch to nearest tab if the closed one was active.
      let nextActive = state.activeTabId;
      if (state.activeTabId === action.id) {
        const closedIdx = state.tabs.findIndex((t) => t.id === action.id);
        const nextIdx = Math.min(closedIdx, remaining.length - 1);
        nextActive = remaining[nextIdx]?.id ?? "";
      }
      return { tabs: remaining, activeTabId: nextActive };
    }

    case "SET_ACTIVE":
      return { ...state, activeTabId: action.id };

    case "SET_RUNNING":
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.id ? { ...t, isRunning: action.isRunning } : t,
        ),
      };

    default:
      return state;
  }
}

// ─── Component ─────────────────────────────────────────────────────────────

/**
 * Container that manages project-scoped terminal tabs.
 *
 * Each tab maps to one live PTY session. Switching tabs uses CSS display so
 * every PTY process and xterm scrollback buffer stays intact. Closing a tab
 * kills the PTY and focuses the nearest remaining tab. Cmd+N opens a new one.
 */
const TerminalArea: React.FC<TerminalAreaProps> = ({
  projectPath,
  onNewSession,
}) => {
  const claude = useClaudeAPI();

  const [state, dispatch] = useReducer(reducer, {
    tabs: [],
    activeTabId: "",
  });

  // Mutable counter so each tab gets a unique sequential name.
  const sessionCounterRef = useRef(0);
  // Track the current projectPath to reset tabs when it changes.
  const prevProjectPathRef = useRef<string | null>(null);

  // ─── Spawn a new PTY session and add a tab ─────────────────────────────
  const createTab = useCallback(async () => {
    sessionCounterRef.current += 1;
    const name = `Session ${sessionCounterRef.current}`;

    try {
      const meta = await claude.createSession({ cwd: projectPath, name });
      const tab: TerminalTab = {
        id: meta.sessionId,
        name: meta.name,
        isRunning: true,
        cwd: meta.cwd,
      };
      dispatch({ type: "ADD_TAB", tab });
    } catch (err) {
      console.error("[TerminalArea] createSession failed:", err);
    }
  }, [claude, projectPath]);

  // ─── Initial tab on mount, reset tabs on projectPath change ───────────
  useEffect(() => {
    if (prevProjectPathRef.current === projectPath) return;
    prevProjectPathRef.current = projectPath;

    // Reset counter so session names restart from 1 for each project.
    sessionCounterRef.current = 0;
    // Clear existing tabs (PTYs for the old project are left for the OS to
    // clean up — their sessions are still alive in the main process).
    dispatch({ type: "REMOVE_TAB", id: "__reset__" }); // no-op id flushes nothing

    void createTab();
  }, [projectPath, createTab]);

  // ─── Close a tab: kill the PTY then remove the tab ────────────────────
  const handleTabClose = useCallback(
    (id: string) => {
      claude.killSession(id).catch((err: unknown) => {
        console.error("[TerminalArea] killSession error:", err);
      });
      dispatch({ type: "REMOVE_TAB", id });
    },
    [claude],
  );

  // ─── Keyboard shortcuts: Cmd+N/Cmd+T new tab, Cmd+W close tab ─────────
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey;
      // Cmd+N or Cmd+T → new terminal tab
      if (mod && (e.key === "n" || e.key === "t")) {
        e.preventDefault();
        void createTab();
        onNewSession?.();
      }
      // Cmd+W → close active tab
      if (mod && e.key === "w") {
        e.preventDefault();
        if (state.activeTabId) {
          handleTabClose(state.activeTabId);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [createTab, onNewSession, state.activeTabId, handleTabClose]);

  // ─── Also wire the menu:new-session event from main process ───────────
  useEffect(() => {
    return claude.onMenuAction("menu:new-session", () => {
      void createTab();
      onNewSession?.();
    });
  }, [claude, createTab, onNewSession]);

  // ─── PTY exit callback from SingleTerminal ────────────────────────────
  const handleExit = useCallback(
    (id: string) => (_exitCode: number) => {
      dispatch({ type: "SET_RUNNING", id, isRunning: false });
    },
    [],
  );

  // ─── Empty-state: no tabs yet ──────────────────────────────────────────
  if (state.tabs.length === 0) {
    return (
      <div
        className="flex flex-col w-full h-full overflow-hidden"
        style={{ backgroundColor: "#171412" }}
      >
        <TerminalTabBar
          tabs={[]}
          activeTabId=""
          onTabSelect={() => undefined}
          onTabClose={() => undefined}
          onNewTab={() => void createTab()}
        />
        <div className="flex-1 flex items-center justify-center">
          <span className="text-stone-600 text-xs font-mono">
            No session. Click + or press Cmd+N.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col w-full h-full overflow-hidden"
      style={{ backgroundColor: "#171412" }}
    >
      <TerminalTabBar
        tabs={state.tabs}
        activeTabId={state.activeTabId}
        onTabSelect={(id) => dispatch({ type: "SET_ACTIVE", id })}
        onTabClose={handleTabClose}
        onNewTab={() => void createTab()}
      />

      {/* All terminal instances mounted; only active one is visible. */}
      <div className="flex-1 min-h-0 min-w-0 relative">
        {state.tabs.map((tab) => (
          <div
            key={tab.id}
            className="absolute inset-0"
            style={{
              display: tab.id === state.activeTabId ? "flex" : "none",
              flexDirection: "column",
            }}
          >
            <SingleTerminal
              sessionId={tab.id}
              isVisible={tab.id === state.activeTabId}
              onExit={handleExit(tab.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default TerminalArea;
