import React, { useEffect, useRef, useCallback, useState } from "react";
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
  isActive?: boolean;
}

/**
 * Main project area.
 *
 * Multiple ProjectViews stay mounted simultaneously (one per booted project)
 * so that terminal sessions survive project switches. Only the active one
 * writes to shared global stores (file-store, activity, etc.).
 */
const ProjectView: React.FC<ProjectViewProps> = ({
  projectPath,
  isActive = true,
}) => {
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

  // ── Estimate terminal dimensions from container ───────────────────────────
  // Uses approximate character metrics for Geist Mono at 14px / 1.4 line-height.
  // This avoids the PTY starting at 120x30 and rendering content at the wrong size
  // before the real fit/resize arrives from xterm.
  const estimateTermSize = useCallback(() => {
    const el = containerRef.current;
    if (!el || el.clientWidth < 100 || el.clientHeight < 100) {
      return { cols: 120, rows: 30 }; // safe default
    }
    const charW = 8.4; // Geist Mono ~14px
    const charH = 14 * 1.4; // lineHeight 1.4
    const pad = 16; // padding in terminal container
    const tabBarH = 34;
    const cols = Math.max(40, Math.floor((el.clientWidth - pad) / charW));
    const rows = Math.max(
      10,
      Math.floor((el.clientHeight - tabBarH - pad) / charH),
    );
    return { cols, rows };
  }, []);

  // ── Create new terminal tab ────────────────────────────────────────────────
  const createNewTab = useCallback(
    async (cwd?: string) => {
      try {
        // Per-project tab numbering based on current tab count
        const tabNumber =
          (useTabStore.getState().tabsByProject[projectPath]?.length ?? 0) + 1;
        const { cols, rows } = estimateTermSize();
        const meta = await claude.createSession({
          cwd: cwd ?? projectPath,
          name: `Session ${tabNumber}`,
          cols,
          rows,
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
    [claude, projectPath, addTab, estimateTermSize],
  );

  // ── Boot: only runs ONCE per project (skips if already booted) ──────────
  // Strategy: check for resumable sessions FIRST (fast filesystem read),
  // then spawn the appropriate PTY — either a fresh shell or `claude --continue`.
  useEffect(() => {
    if (!projectPath || isBooted) return;

    let cancelled = false;
    setIsBooting(true);
    setBootError(null);

    const boot = async () => {
      try {
        if (cancelled) return;

        // Step 1: Check for resumable sessions BEFORE spawning any PTY.
        // This is a fast filesystem read (~1-5ms), not a slow network call.
        let resumeSessionId: string | undefined;
        try {
          const sessions = await claude.getProjectSessions(projectPath);

          if (sessions && sessions.length > 0 && !cancelled) {
            const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
            const recent = sessions[0]!;

            if (recent.lastActiveAt > threeDaysAgo) {
              const shouldResume = window.confirm(
                `Resume your last Claude session?\n\nLast active: ${new Date(recent.lastActiveAt).toLocaleString()}\nModel: ${recent.model ?? "unknown"}`,
              );
              if (shouldResume) {
                resumeSessionId = recent.sessionId;
              }
            }
          }
        } catch {
          // Session scan failed — just start a fresh session
        }

        if (cancelled) return;

        // Step 2: Spawn the PTY — either resumed or fresh.
        // Uses --resume <id> (direct lookup) instead of --continue (scans
        // all sessions — slow and unreliable for projects with many sessions).
        const tabNumber =
          (useTabStore.getState().tabsByProject[projectPath]?.length ?? 0) + 1;
        const { cols, rows } = estimateTermSize();

        const meta = await claude.createSession({
          cwd: projectPath,
          name: resumeSessionId
            ? `Resumed ${tabNumber}`
            : `Session ${tabNumber}`,
          cols,
          rows,
          ...(resumeSessionId ? { resumeSessionId } : {}),
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
      const doClose = () => {
        removeTab(projectPath, sessionId);
        claude.killSession(sessionId).catch(() => {});
      };

      const tab = tabs.find((t) => t.sessionId === sessionId);
      if (!tab?.isActive) {
        // PTY already exited — just remove the tab, no need to kill.
        removeTab(projectPath, sessionId);
        return;
      }

      // Check for any running child processes inside the shell.
      // Matches real terminal behavior: confirm only when a process is running.
      claude
        .getChildProcesses(sessionId)
        .then((processes) => {
          if (processes.length === 0) {
            // Shell is idle — close silently, no confirmation.
            doClose();
            return;
          }

          const isClaude = processes.some((p) => p.includes("claude"));
          const message = isClaude
            ? "Claude is running in this session. Close it?\n\nIn-flight requests will be cancelled."
            : `A process is still running: ${processes.join(", ")}\n\nClose this terminal?`;

          const confirmed = window.confirm(message);
          if (!confirmed) return;

          doClose();
        })
        .catch(() => {
          // If the check fails, just close without asking.
          doClose();
        });
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
  const insertFileEntry = useFileStore((s) => s.insertFileEntry);
  const removeFileEntry = useFileStore((s) => s.removeFileEntry);
  const addTouchedFile = useFileStore((s) => s.addTouchedFile);

  // Only load file tree and watch for changes when THIS project is active.
  // This prevents hidden ProjectViews from overwriting the shared file store.
  useEffect(() => {
    if (!projectPath || !isActive) return;
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
  }, [projectPath, isActive, claude, setCwd, setFileTree]);

  useEffect(() => {
    if (!projectPath || !isActive) return;
    claude.watchCwd(projectPath).catch(() => {});
    const unsub = claude.onCwdFileChanged((payload) => {
      if (payload.event === "add") {
        insertFileEntry(payload.filePath, false);
        addTouchedFile(payload.filePath);
      } else if (payload.event === "addDir") {
        insertFileEntry(payload.filePath, true);
      } else if (payload.event === "change") {
        addTouchedFile(payload.filePath);
      } else if (payload.event === "unlink" || payload.event === "unlinkDir") {
        removeFileEntry(payload.filePath);
      }
    });
    return () => unsub();
  }, [
    projectPath,
    isActive,
    claude,
    insertFileEntry,
    removeFileEntry,
    addTouchedFile,
  ]);

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

      {/* Resizable divider + Info tabs — only rendered for active project.
          Unmounts when switching away, remounts when switching back.
          Components handle remount gracefully (git/activity re-fetch). */}
      {isActive && (
        <>
          <ResizeDivider orientation="horizontal" onDrag={handleDividerDrag} />
          <div
            className="shrink-0 overflow-hidden"
            style={infoPanelCollapsed ? {} : { height: `${infoPanelHeight}%` }}
          >
            <InfoTabs projectPath={projectPath} />
          </div>
        </>
      )}
    </div>
  );
};

export default ProjectView;
