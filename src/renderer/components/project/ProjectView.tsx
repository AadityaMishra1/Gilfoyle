import React, {
  useEffect,
  useRef,
  useCallback,
  useState,
  useMemo,
} from "react";
import TerminalPanel, { type TerminalTab } from "../panels/TerminalPanel";
import InfoTabs from "./InfoTabs";
import { EditorPanel } from "../editor/EditorPanel";
import ResizeDivider from "../shared/ResizeDivider";
import { useLayoutStore } from "../../stores/layout-store";
import { useTabStore, type TabEntry } from "../../stores/tab-store";
import { useClaudeAPI } from "../../hooks/use-ipc";
import { useFileStore } from "../../stores/file-store";
import type { FileEntry } from "../../stores/file-store";

const EMPTY_TABS: TabEntry[] = [];

// ─── ProjectView ──────────────────────────────────────────────────────────────

interface ProjectViewProps {
  projectPath: string;
}

/**
 * Main project area.
 *
 * Tabs are stored per-project in a Zustand store, so switching between
 * projects preserves each project's terminal sessions independently.
 */
const ProjectView: React.FC<ProjectViewProps> = ({ projectPath }) => {
  const claude = useClaudeAPI();
  const { infoPanelHeight, setInfoPanelHeight, infoPanelCollapsed } =
    useLayoutStore();

  // ── Per-project tab state from store ────────────────────────────────────
  const tabs = useTabStore((s) => s.tabsByProject[projectPath] ?? EMPTY_TABS);
  const activeTabId = useTabStore(
    (s) => s.activeTabByProject[projectPath] ?? null,
  );
  const isBooted = useTabStore((s) => s.bootedProjects.has(projectPath));
  const { addTab, removeTab, updateTab, setActiveTabId, markBooted } =
    useTabStore();

  const [isBooting, setIsBooting] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Create new terminal tab ────────────────────────────────────────────────
  const createNewTab = useCallback(
    async (cwd?: string) => {
      try {
        // Per-project tab numbering based on current tab count
        const tabNumber =
          (useTabStore.getState().tabsByProject[projectPath]?.length ?? 0) + 1;
        const meta = await claude.createSession({
          cwd: cwd ?? projectPath,
          name: `Session ${tabNumber}`,
        });

        addTab(projectPath, {
          sessionId: meta.sessionId,
          name: meta.name,
          cwd: meta.cwd,
          isActive: true,
        });
        return meta.sessionId;
      } catch (err) {
        console.error("[ProjectView] Failed to create tab:", err);
        return null;
      }
    },
    [claude, projectPath, addTab],
  );

  // ── Boot: only runs ONCE per project (skips if already booted) ──────────
  useEffect(() => {
    if (!projectPath || isBooted) return;

    let cancelled = false;
    setIsBooting(true);
    setBootError(null);

    const boot = async () => {
      try {
        if (cancelled) return;

        // Check if this project has a recent session to resume.
        // Uses lightweight per-project scan (reads only this project's dir,
        // not all 1000+ session files like scanAll does).
        let shouldContinue = false;
        try {
          const sessions = await claude.getProjectSessions(projectPath);

          if (sessions && sessions.length > 0 && !cancelled) {
            const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
            const recent = sessions[0]!;

            if (recent.lastActiveAt > threeDaysAgo) {
              shouldContinue = window.confirm(
                `Resume your last Claude session?\n\nLast active: ${new Date(recent.lastActiveAt).toLocaleString()}\nModel: ${recent.model ?? "unknown"}`,
              );
            }
          }
        } catch {
          // Scan failed — just start fresh
        }

        if (cancelled) return;

        const tabNumber =
          (useTabStore.getState().tabsByProject[projectPath]?.length ?? 0) + 1;
        const meta = await claude.createSession({
          cwd: projectPath,
          name: shouldContinue
            ? `Resumed ${tabNumber}`
            : `Session ${tabNumber}`,
          continueSession: shouldContinue,
        });

        if (cancelled) return;

        addTab(projectPath, {
          sessionId: meta.sessionId,
          name: meta.name,
          cwd: meta.cwd,
          isActive: true,
        });
        markBooted(projectPath);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setBootError(msg);
        }
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, [projectPath, isBooted, claude, addTab, markBooted]);

  // If already booted, clear booting state
  useEffect(() => {
    if (isBooted) {
      setIsBooting(false);
      setBootError(null);
    }
  }, [isBooted]);

  // ── Close tab ──────────────────────────────────────────────────────────────
  const closeTab = useCallback(
    (sessionId: string) => {
      const tab = tabs.find((t) => t.sessionId === sessionId);

      const doClose = () => {
        removeTab(projectPath, sessionId);
        claude.killSession(sessionId).catch(() => {});
      };

      if (tab?.isActive) {
        const confirmed = window.confirm(
          "This session is still running. Are you sure you want to close it?\n\nThe Claude process will be terminated.",
        );
        if (!confirmed) return;
      }

      doClose();
    },
    [claude, tabs, projectPath, removeTab],
  );

  // ── Tab exit ───────────────────────────────────────────────────────────────
  const handleTabExit = useCallback(
    (sessionId: string, _exitCode: number) => {
      updateTab(projectPath, sessionId, { isActive: false });
    },
    [projectPath, updateTab],
  );

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "n" || e.key === "t")) {
        e.preventDefault();
        void createNewTab();
      }
      if (mod && e.key === "w") {
        e.preventDefault();
        if (activeTabId) {
          closeTab(activeTabId);
        }
      }
      if (mod && e.key >= "1" && e.key <= "9" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const digit = parseInt(e.key, 10);
        if (tabs.length > 0) {
          const index =
            digit === 9
              ? tabs.length - 1
              : Math.min(digit - 1, tabs.length - 1);
          setActiveTabId(projectPath, tabs[index]!.sessionId);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [createNewTab, closeTab, activeTabId, tabs, projectPath, setActiveTabId]);

  // ── Load file tree when project path changes ──────────────────────────────
  const setCwd = useFileStore((s) => s.setCwd);
  const setFileTree = useFileStore((s) => s.setFileTree);

  useEffect(() => {
    if (!projectPath) return;
    setCwd(projectPath);

    const loadFiles = async () => {
      try {
        const tree = await claude.scanDir(projectPath, 5);
        const mapped: FileEntry[] = tree.map(function mapEntry(e: {
          path: string;
          name: string;
          isDirectory: boolean;
          children?: unknown[];
        }): FileEntry {
          return {
            path: e.path,
            name: e.name,
            isDirectory: e.isDirectory,
            children: e.children
              ? (e.children as typeof tree).map(mapEntry)
              : undefined,
          };
        });
        setFileTree(mapped);
      } catch (err) {
        console.warn("[ProjectView] scanDir failed:", err);
      }
    };
    void loadFiles();
  }, [projectPath, claude, setCwd, setFileTree]);

  // ── Resizable divider drag ─────────────────────────────────────────────────
  const handleDividerDrag = useCallback(
    (deltaY: number) => {
      const container = containerRef.current;
      if (!container) return;
      const totalH = container.clientHeight;
      if (totalH === 0) return;
      const deltaPct = (deltaY / totalH) * 100;
      const current = useLayoutStore.getState().infoPanelHeight;
      setInfoPanelHeight(current - deltaPct);
    },
    [setInfoPanelHeight],
  );

  // ── Editor split ──────────────────────────────────────────────────────────
  const openFile = useFileStore((s) => s.openFile);
  const { editorSplitPct, setEditorSplitPct } = useLayoutStore();

  const handleEditorDrag = useCallback(
    (deltaX: number) => {
      const container = containerRef.current;
      if (!container) return;
      const totalW = container.clientWidth;
      if (totalW === 0) return;
      const deltaPct = (deltaX / totalW) * 100;
      const current = useLayoutStore.getState().editorSplitPct;
      setEditorSplitPct(current + deltaPct);
    },
    [setEditorSplitPct],
  );

  // ── Terminal area height ────────────────────────────────────────────────────
  const terminalHeightPct = infoPanelCollapsed ? 100 : 100 - infoPanelHeight;

  // ── Convert store tabs to TerminalPanel format ──────────────────────────────
  const terminalTabs: TerminalTab[] = tabs.map((t) => ({
    sessionId: t.sessionId,
    name: t.name,
    cwd: t.cwd,
    isActive: t.isActive,
  }));

  // ── Loading / error states ──────────────────────────────────────────────────
  let terminalContent: React.ReactNode;
  if (isBooting && tabs.length === 0) {
    terminalContent = (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-6 h-6 rounded-full border-2 border-amber-500 border-t-transparent animate-spin"
            role="status"
            aria-label="Starting session"
          />
          <span
            className="text-stone-500 text-xs tracking-wider"
            style={{ fontFamily: "'Geist Mono', monospace" }}
          >
            Starting session...
          </span>
        </div>
      </div>
    );
  } else if (bootError && tabs.length === 0) {
    terminalContent = (
      <div className="flex-1 flex items-center justify-center p-8 h-full">
        <div className="max-w-md w-full rounded-lg border border-red-900/50 bg-red-950/30 p-4">
          <p className="text-red-400 text-sm font-medium mb-1">
            Failed to start session
          </p>
          <p className="text-red-500/70 text-xs break-all font-mono">
            {bootError}
          </p>
        </div>
      </div>
    );
  } else {
    terminalContent = (
      <TerminalPanel
        tabs={terminalTabs}
        activeTabId={activeTabId}
        onTabSelect={(id) => setActiveTabId(projectPath, id)}
        onTabClose={closeTab}
        onNewTab={() => void createNewTab()}
        onTabExit={handleTabExit}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col w-full h-full overflow-hidden"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      {/* Terminal + Editor area */}
      <div
        className={
          infoPanelCollapsed
            ? "flex-1 overflow-hidden flex min-h-0"
            : "shrink-0 overflow-hidden flex"
        }
        style={
          infoPanelCollapsed ? undefined : { height: `${terminalHeightPct}%` }
        }
      >
        {/* Terminal */}
        <div
          className="overflow-hidden h-full"
          style={{ width: openFile ? `${editorSplitPct}%` : "100%" }}
        >
          {terminalContent}
        </div>

        {/* Resize divider between terminal and editor */}
        {openFile && (
          <ResizeDivider orientation="vertical" onDrag={handleEditorDrag} />
        )}

        {/* Editor panel (when a file is open) */}
        {openFile && (
          <div
            className="overflow-hidden h-full"
            style={{ width: `${100 - editorSplitPct}%` }}
          >
            <EditorPanel />
          </div>
        )}
      </div>

      {/* Resizable divider between terminal area and info tabs */}
      <ResizeDivider orientation="horizontal" onDrag={handleDividerDrag} />

      {/* Info tabs */}
      <div
        className={
          infoPanelCollapsed
            ? "shrink-0 overflow-hidden"
            : "shrink-0 overflow-hidden"
        }
        style={infoPanelCollapsed ? {} : { height: `${infoPanelHeight}%` }}
      >
        <InfoTabs projectPath={projectPath} />
      </div>
    </div>
  );
};

export default ProjectView;
