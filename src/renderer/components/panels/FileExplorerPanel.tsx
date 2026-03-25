/**
 * FileExplorerPanel — Combines the file tree and diff viewer for the "Files"
 * mosaic panel with full file management: create, rename, delete, context menu.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FolderTree,
  Eye,
  GitCompareArrows,
  FilePlus,
  FolderPlus,
} from "lucide-react";
import { useFileStore } from "../../stores/file-store";
import type { FileEntry } from "../../stores/file-store";
import { useSessionStore } from "../../stores/session-store";
import TreeView, { ContextMenu } from "../shared/TreeView";
import DiffViewer from "../shared/DiffViewer";

// ─── Window API type ──────────────────────────────────────────────────────────

type ClaudeWindow = Window & {
  claude?: {
    watchCwd?: (cwd: string) => Promise<void>;
    onCwdFileChanged?: (
      cb: (payload: { event: string; filePath: string }) => void,
    ) => () => void;
    createFile?: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
    createDir?: (dirPath: string) => Promise<{ ok: boolean; error?: string }>;
    renameFile?: (
      oldPath: string,
      newPath: string,
    ) => Promise<{ ok: boolean; error?: string }>;
    trashFile?: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
    revealInFinder?: (filePath: string) => Promise<void>;
  };
};

// ─── Draggable divider ────────────────────────────────────────────────────────

interface DividerProps {
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
  onNewFile: () => void;
  onNewFolder: () => void;
}

const Header: React.FC<HeaderProps> = ({
  cwd,
  touchedCount,
  onNewFile,
  onNewFolder,
}) => (
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

    {/* New File / New Folder toolbar buttons */}
    {cwd !== null && (
      <>
        <button
          type="button"
          onClick={onNewFile}
          className="shrink-0 p-0.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors cursor-pointer"
          title="New File"
        >
          <FilePlus size={12} />
        </button>
        <button
          type="button"
          onClick={onNewFolder}
          className="shrink-0 p-0.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors cursor-pointer"
          title="New Folder"
        >
          <FolderPlus size={12} />
        </button>
      </>
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
  const inlineEdit = useFileStore((s) => s.inlineEdit);

  const toggleExpanded = useFileStore((s) => s.toggleExpanded);
  const selectFile = useFileStore((s) => s.selectFile);
  const setCurrentDiff = useFileStore((s) => s.setCurrentDiff);
  const setCwd = useFileStore((s) => s.setCwd);
  const addTouchedFile = useFileStore((s) => s.addTouchedFile);
  const insertFileEntry = useFileStore((s) => s.insertFileEntry);
  const removeFileEntry = useFileStore((s) => s.removeFileEntry);
  const startInlineEdit = useFileStore((s) => s.startInlineEdit);
  const cancelInlineEdit = useFileStore((s) => s.cancelInlineEdit);
  const renameFileEntry = useFileStore((s) => s.renameFileEntry);

  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);

  const [topPct, setTopPct] = useState(60);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    entry: FileEntry;
    siblings: FileEntry[];
  } | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);
  const win = window as ClaudeWindow;

  // Seed CWD and start file watcher.
  useEffect(() => {
    const activeSession = sessions.find((s) => s.sessionId === activeSessionId);
    const sessionCwd =
      (activeSession as { cwd?: string } | undefined)?.cwd ?? null;

    if (sessionCwd) {
      setCwd(sessionCwd);
      win.claude?.watchCwd?.(sessionCwd).catch(() => {});
    }

    const unsub = win.claude?.onCwdFileChanged?.((payload) => {
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

    return () => unsub?.();
  }, [
    activeSessionId,
    sessions,
    setCwd,
    addTouchedFile,
    insertFileEntry,
    removeFileEntry,
  ]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F2" && selectedFile) {
        e.preventDefault();
        startInlineEdit({ mode: "rename", targetPath: selectedFile });
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Backspace" && selectedFile) {
        e.preventDefault();
        handleDelete(selectedFile);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedFile]);

  // ── Create target: determine where new files/folders go ─────────────────
  const getCreateTarget = useCallback((): string => {
    if (!selectedFile) return "";
    const findEntry = (
      entries: FileEntry[],
      path: string,
    ): FileEntry | null => {
      for (const e of entries) {
        if (e.path === path) return e;
        if (e.children) {
          const found = findEntry(e.children, path);
          if (found) return found;
        }
      }
      return null;
    };
    const entry = findEntry(fileTree, selectedFile);
    if (entry?.isDirectory && expandedPaths.has(entry.path)) {
      return entry.path;
    }
    const lastSlash = selectedFile.lastIndexOf("/");
    return lastSlash > 0 ? selectedFile.substring(0, lastSlash) : "";
  }, [selectedFile, fileTree, expandedPaths]);

  const handleNewFile = useCallback(() => {
    startInlineEdit({ mode: "create-file", targetPath: getCreateTarget() });
  }, [getCreateTarget, startInlineEdit]);

  const handleNewFolder = useCallback(() => {
    startInlineEdit({ mode: "create-folder", targetPath: getCreateTarget() });
  }, [getCreateTarget, startInlineEdit]);

  // ── Inline edit confirm ─────────────────────────────────────────────────
  const handleInlineConfirm = useCallback(
    async (name: string) => {
      if (!cwd || !inlineEdit) return;

      if (inlineEdit.mode === "rename") {
        const oldRelative = inlineEdit.targetPath;
        const lastSlash = oldRelative.lastIndexOf("/");
        const parentRelative =
          lastSlash > 0 ? oldRelative.substring(0, lastSlash) : "";
        const newRelative = parentRelative ? `${parentRelative}/${name}` : name;
        const oldAbsolute = `${cwd}/${oldRelative}`;
        const newAbsolute = `${cwd}/${newRelative}`;

        const result = await win.claude?.renameFile?.(oldAbsolute, newAbsolute);
        if (result?.ok) {
          renameFileEntry(oldRelative, newRelative);
        }
      } else {
        const parentRelative = inlineEdit.targetPath;
        const newRelative = parentRelative ? `${parentRelative}/${name}` : name;
        const absolute = `${cwd}/${newRelative}`;

        if (inlineEdit.mode === "create-folder") {
          await win.claude?.createDir?.(absolute);
        } else {
          await win.claude?.createFile?.(absolute);
          selectFile(newRelative);
        }
      }
      cancelInlineEdit();
    },
    [
      cwd,
      inlineEdit,
      win.claude,
      renameFileEntry,
      selectFile,
      cancelInlineEdit,
    ],
  );

  // ── Delete handler ──────────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (filePath: string) => {
      if (!cwd) return;
      const name = filePath.split("/").pop() ?? filePath;
      const confirmed = window.confirm(`Move "${name}" to Trash?`);
      if (!confirmed) return;

      const absolute = `${cwd}/${filePath}`;
      const result = await win.claude?.trashFile?.(absolute);
      if (result?.ok && selectedFile === filePath) {
        selectFile(null);
      }
    },
    [cwd, selectedFile, selectFile, win.claude],
  );

  // ── Context menu ────────────────────────────────────────────────────────
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, entry: FileEntry, _siblings: FileEntry[]) => {
      setCtxMenu({ x: e.clientX, y: e.clientY, entry, siblings: _siblings });
    },
    [],
  );

  const handleSelectFile = useCallback(
    (path: string) => {
      selectFile(path);
      if (!touchedFiles.has(path)) {
        setCurrentDiff(null);
      }
    },
    [selectFile, setCurrentDiff, touchedFiles],
  );

  const handleDividerDrag = useCallback((pct: number) => setTopPct(pct), []);

  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden"
      style={{ backgroundColor: "#09090b" }}
    >
      <Header
        cwd={cwd}
        touchedCount={touchedFiles.size}
        onNewFile={handleNewFile}
        onNewFolder={handleNewFolder}
      />

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
            inlineEdit={inlineEdit}
            onToggleExpand={toggleExpanded}
            onSelectFile={handleSelectFile}
            onContextMenu={handleContextMenu}
            onInlineConfirm={handleInlineConfirm}
            onInlineCancel={cancelInlineEdit}
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

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          isDirectory={ctxMenu.entry.isDirectory}
          onNewFile={() => {
            const target = ctxMenu.entry.isDirectory
              ? ctxMenu.entry.path
              : ctxMenu.entry.path.substring(
                  0,
                  ctxMenu.entry.path.lastIndexOf("/"),
                ) || "";
            if (ctxMenu.entry.isDirectory) toggleExpanded(ctxMenu.entry.path);
            startInlineEdit({ mode: "create-file", targetPath: target });
          }}
          onNewFolder={() => {
            const target = ctxMenu.entry.isDirectory
              ? ctxMenu.entry.path
              : ctxMenu.entry.path.substring(
                  0,
                  ctxMenu.entry.path.lastIndexOf("/"),
                ) || "";
            if (ctxMenu.entry.isDirectory) toggleExpanded(ctxMenu.entry.path);
            startInlineEdit({ mode: "create-folder", targetPath: target });
          }}
          onRename={() =>
            startInlineEdit({
              mode: "rename",
              targetPath: ctxMenu.entry.path,
            })
          }
          onDelete={() => handleDelete(ctxMenu.entry.path)}
          onCopyPath={() => {
            const abs = cwd
              ? `${cwd}/${ctxMenu.entry.path}`
              : ctxMenu.entry.path;
            navigator.clipboard.writeText(abs).catch(() => {});
          }}
          onCopyRelativePath={() =>
            navigator.clipboard.writeText(ctxMenu.entry.path).catch(() => {})
          }
          onRevealInFinder={() => {
            const abs = cwd
              ? `${cwd}/${ctxMenu.entry.path}`
              : ctxMenu.entry.path;
            win.claude?.revealInFinder?.(abs).catch(() => {});
          }}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
};

export default FileExplorerPanel;
