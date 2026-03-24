/**
 * FileExplorerPanel — Combines the file tree and diff viewer for the "Files"
 * mosaic panel.
 *
 * Layout (top-to-bottom):
 *   - Panel header   — CWD path + icon strip
 *   - File tree      — scrollable, ~60% of remaining height
 *   - Divider        — draggable handle
 *   - Diff viewer    — scrollable, ~40% of remaining height
 *
 * When a touched file is selected the diff viewer is populated automatically
 * via the file-store.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { FolderTree, Eye, GitCompareArrows } from "lucide-react";
import { useFileStore } from "../../stores/file-store";
import { useSessionStore } from "../../stores/session-store";
import TreeView from "../shared/TreeView";
import DiffViewer from "../shared/DiffViewer";

// ─── Window API type ──────────────────────────────────────────────────────────

type ClaudeWindow = Window & {
  claude?: {
    watchCwd?: (cwd: string) => Promise<void>;
    onCwdFileChanged?: (
      cb: (payload: { event: string; filePath: string }) => void,
    ) => () => void;
  };
};

// ─── Draggable divider ────────────────────────────────────────────────────────

interface DividerProps {
  /** Called continuously while the user drags; receives the new top-pane % */
  onDrag: (topPercent: number) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

const Divider: React.FC<DividerProps> = ({ onDrag, containerRef }) => {
  const dragging = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const offsetY = ev.clientY - rect.top;
        const percent = Math.min(
          Math.max((offsetY / rect.height) * 100, 20),
          80,
        );
        onDrag(percent);
      };

      const onMouseUp = () => {
        dragging.current = false;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [onDrag, containerRef],
  );

  return (
    <div
      className="shrink-0 h-1 cursor-row-resize bg-zinc-800 hover:bg-amber-500/40 transition-colors duration-100 group relative"
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize file tree and diff viewer"
    >
      {/* Visual grab indicator */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none">
        <div className="w-8 h-0.5 rounded-full bg-zinc-700 group-hover:bg-amber-500/60 transition-colors duration-100" />
      </div>
    </div>
  );
};

// ─── Header ───────────────────────────────────────────────────────────────────

interface HeaderProps {
  cwd: string | null;
  touchedCount: number;
}

const Header: React.FC<HeaderProps> = ({ cwd, touchedCount }) => (
  <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 shrink-0 min-w-0">
    <FolderTree size={13} className="text-amber-500 shrink-0" />

    {cwd !== null ? (
      <>
        <span
          className="text-zinc-400 text-xs truncate flex-1 min-w-0"
          style={{ fontFamily: "'Geist Mono', monospace" }}
          title={cwd}
        >
          {cwd}
        </span>
        {/* Watching indicator */}
        <span
          className="shrink-0 text-zinc-600 text-xs"
          style={{ fontFamily: "'Geist Mono', monospace", fontSize: 9 }}
          title="Watching for file changes"
        >
          watching
        </span>
      </>
    ) : (
      <span
        className="text-zinc-600 text-xs flex-1 min-w-0"
        style={{ fontFamily: "'Geist Mono', monospace" }}
      >
        Open a session to explore files
      </span>
    )}

    {touchedCount > 0 && (
      <div
        className="flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-sm bg-amber-500/10 border border-amber-500/20"
        title={`${touchedCount} file${touchedCount === 1 ? "" : "s"} modified by Claude`}
      >
        <Eye size={10} className="text-amber-400" />
        <span
          className="text-amber-400 tabular-nums"
          style={{ fontSize: 10, fontFamily: "'Geist Mono', monospace" }}
        >
          {touchedCount}
        </span>
      </div>
    )}
  </div>
);

// ─── Diff pane header ─────────────────────────────────────────────────────────

const DiffPaneLabel: React.FC = () => (
  <div className="flex items-center gap-1.5 px-3 py-1 border-b border-t border-zinc-800 shrink-0 bg-zinc-900/50">
    <GitCompareArrows size={11} className="text-zinc-600 shrink-0" />
    <span
      className="text-zinc-600 text-xs uppercase tracking-wide"
      style={{ fontSize: 10, fontFamily: "'Geist', system-ui, sans-serif" }}
    >
      Diff
    </span>
  </div>
);

// ─── Main panel ───────────────────────────────────────────────────────────────

const FileExplorerPanel: React.FC = () => {
  const fileTree = useFileStore((s) => s.fileTree);
  const expandedPaths = useFileStore((s) => s.expandedPaths);
  const selectedFile = useFileStore((s) => s.selectedFile);
  const currentDiff = useFileStore((s) => s.currentDiff);
  const touchedFiles = useFileStore((s) => s.touchedFiles);
  const cwd = useFileStore((s) => s.cwd);

  const toggleExpanded = useFileStore((s) => s.toggleExpanded);
  const selectFile = useFileStore((s) => s.selectFile);
  const setCurrentDiff = useFileStore((s) => s.setCurrentDiff);
  const setCwd = useFileStore((s) => s.setCwd);
  const addTouchedFile = useFileStore((s) => s.addTouchedFile);

  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);

  // On mount (and when the active session changes), seed the CWD from the
  // session metadata and start the file watcher via the preload bridge.
  useEffect(() => {
    const win = window as ClaudeWindow;

    // Resolve the working directory from the active session's metadata.
    const activeSession = sessions.find((s) => s.sessionId === activeSessionId);
    const sessionCwd =
      (activeSession as { cwd?: string } | undefined)?.cwd ?? null;

    if (sessionCwd) {
      setCwd(sessionCwd);
      // Ask the main process to start watching for file changes.
      win.claude?.watchCwd?.(sessionCwd).catch(() => {
        // watchCwd is best-effort — ignore errors silently.
      });
    }

    // Subscribe to CWD file-change events pushed by the main process.
    const unsub = win.claude?.onCwdFileChanged?.((payload) => {
      // Any write or create event means Claude touched this file.
      if (payload.event === "change" || payload.event === "add") {
        addTouchedFile(payload.filePath);
      }
    });

    return () => unsub?.();
  }, [activeSessionId, sessions, setCwd, addTouchedFile]);

  // Split position as a percentage of the body height (tree pane takes topPct%).
  const [topPct, setTopPct] = useState(60);

  const bodyRef = useRef<HTMLDivElement>(null);

  const handleSelectFile = useCallback(
    (path: string) => {
      selectFile(path);
      // Clear the diff when switching to a non-touched file so the viewer
      // shows the empty state rather than stale data from a previous selection.
      if (!touchedFiles.has(path)) {
        setCurrentDiff(null);
      }
    },
    [selectFile, setCurrentDiff, touchedFiles],
  );

  const handleDividerDrag = useCallback((pct: number) => {
    setTopPct(pct);
  }, []);

  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden"
      style={{ backgroundColor: "#09090b" }}
    >
      {/* Panel header */}
      <Header cwd={cwd} touchedCount={touchedFiles.size} />

      {/* Resizable body */}
      <div
        ref={bodyRef}
        className="flex-1 min-h-0 flex flex-col overflow-hidden"
      >
        {/* File tree pane */}
        <div
          className="overflow-y-auto overflow-x-hidden min-h-0"
          style={{ height: `${topPct}%` }}
        >
          <TreeView
            entries={fileTree}
            expandedPaths={expandedPaths}
            selectedFile={selectedFile}
            touchedFiles={touchedFiles}
            onToggleExpand={toggleExpanded}
            onSelectFile={handleSelectFile}
          />
        </div>

        {/* Draggable divider */}
        <Divider
          onDrag={handleDividerDrag}
          containerRef={bodyRef as React.RefObject<HTMLDivElement>}
        />

        {/* Diff viewer pane */}
        <div
          className="min-h-0 flex flex-col overflow-hidden"
          style={{ height: `${100 - topPct}%` }}
        >
          <DiffPaneLabel />
          <div className="flex-1 min-h-0 overflow-hidden">
            <DiffViewer diff={currentDiff} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileExplorerPanel;
