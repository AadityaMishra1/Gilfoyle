/**
 * ProjectFiles — Info Tabs "Files" tab content.
 *
 * Shows the project file tree for the current session CWD with full file
 * management: create files/folders, rename, delete, copy path, reveal in
 * Finder. Files Claude has touched are highlighted with a peach/amber
 * indicator. Clicking a file opens a read-only code viewer pane below.
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from "react";
import {
  FolderTree,
  Eye,
  ExternalLink,
  FileCode,
  File as FileIcon,
  FilePlus,
  FolderPlus,
} from "lucide-react";
import { useFileStore } from "../../stores/file-store";
import type { FileEntry } from "../../stores/file-store";
import TreeView, { ContextMenu } from "../shared/TreeView";

// ─── Window API type ──────────────────────────────────────────────────────────

type ClaudeWindow = Window & {
  claude?: {
    openInEditor?: (absolutePath: string) => Promise<void>;
    readFile?: (absolutePath: string) => Promise<string>;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function langFromPath(path: string): string {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  const MAP: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "jsx",
    ".json": "json",
    ".md": "markdown",
    ".py": "python",
    ".rs": "rust",
    ".go": "go",
    ".sh": "bash",
    ".css": "css",
    ".html": "html",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".env": "dotenv",
  };
  return MAP[ext] ?? "text";
}

// ─── Draggable divider ────────────────────────────────────────────────────────

interface DividerProps {
  onDrag: (pct: number) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

const Divider: React.FC<DividerProps> = ({ onDrag, containerRef }) => {
  const dragging = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;

      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const pct = Math.min(
          Math.max(((ev.clientY - rect.top) / rect.height) * 100, 20),
          80,
        );
        onDrag(pct);
      };

      const onUp = () => {
        dragging.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [onDrag, containerRef],
  );

  return (
    <div
      className="shrink-0 h-px cursor-row-resize bg-stone-800 hover:bg-[#e8a872]/40 transition-colors duration-100 relative group"
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize file tree and code viewer"
    >
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none">
        <div className="w-8 h-0.5 rounded-full bg-stone-700 group-hover:bg-[#e8a872]/50 transition-colors" />
      </div>
    </div>
  );
};

// ─── Header ───────────────────────────────────────────────────────────────────

interface HeaderProps {
  cwd: string | null;
  touchedCount: number;
  selectedFile: string | null;
  onOpenInEditor: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
}

const Header: React.FC<HeaderProps> = ({
  cwd,
  touchedCount,
  selectedFile,
  onOpenInEditor,
  onNewFile,
  onNewFolder,
}) => (
  <div className="flex items-center gap-2 px-3 py-1.5 border-b border-stone-800 shrink-0 min-w-0">
    <FolderTree size={12} className="text-[#e8a872] shrink-0" />

    {cwd !== null ? (
      <span
        className="text-stone-400 text-[11px] truncate flex-1 min-w-0"
        style={{ fontFamily: "'Geist Mono', monospace" }}
        title={cwd}
      >
        {cwd}
      </span>
    ) : (
      <span
        className="text-stone-600 text-[11px] flex-1 min-w-0"
        style={{ fontFamily: "'Geist Mono', monospace" }}
      >
        Open a session to explore files
      </span>
    )}

    {touchedCount > 0 && (
      <span
        className="inline-flex items-center gap-1 shrink-0 px-1.5 py-px rounded bg-[#e8a872]/10
          border border-[#e8a872]/20 text-[#e8a872] tabular-nums"
        style={{ fontSize: 9, fontFamily: "'Geist Mono', monospace" }}
        title={`${touchedCount} file${touchedCount === 1 ? "" : "s"} modified by Claude`}
      >
        <Eye size={9} />
        {touchedCount}
      </span>
    )}

    {/* New File / New Folder toolbar buttons */}
    {cwd !== null && (
      <>
        <button
          type="button"
          onClick={onNewFile}
          className="shrink-0 p-0.5 rounded text-stone-500 hover:text-stone-300 hover:bg-stone-700/50 transition-colors cursor-pointer"
          title="New File"
        >
          <FilePlus size={12} />
        </button>
        <button
          type="button"
          onClick={onNewFolder}
          className="shrink-0 p-0.5 rounded text-stone-500 hover:text-stone-300 hover:bg-stone-700/50 transition-colors cursor-pointer"
          title="New Folder"
        >
          <FolderPlus size={12} />
        </button>
      </>
    )}

    {selectedFile !== null && (
      <button
        type="button"
        onClick={onOpenInEditor}
        className="inline-flex items-center gap-1 shrink-0 px-1.5 py-px rounded
          text-stone-500 hover:text-stone-300 hover:bg-stone-700/50 transition-colors cursor-pointer"
        style={{ fontSize: 9, fontFamily: "'Geist', system-ui, sans-serif" }}
        title="Open in VS Code"
      >
        <ExternalLink size={9} />
        VS Code
      </button>
    )}
  </div>
);

// ─── Code viewer ──────────────────────────────────────────────────────────────

interface CodeViewerProps {
  filePath: string | null;
  content: string | null;
  loading: boolean;
}

const CodeViewer: React.FC<CodeViewerProps> = ({
  filePath,
  content,
  loading,
}) => {
  const lang = filePath ? langFromPath(filePath) : "";
  const name = filePath ? (filePath.split("/").pop() ?? filePath) : null;

  if (!filePath) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 py-8">
        <FileIcon size={16} className="text-stone-700" />
        <span
          className="text-stone-600 text-[10px]"
          style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
        >
          Select a file to view its contents
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-3 py-1 border-b border-stone-800 shrink-0 bg-stone-900/40">
        <FileCode size={11} className="text-stone-600 shrink-0" />
        <span
          className="flex-1 min-w-0 truncate text-stone-400"
          style={{ fontSize: 10, fontFamily: "'Geist Mono', monospace" }}
          title={filePath}
        >
          {name}
        </span>
        <span
          className="text-stone-700 shrink-0 uppercase"
          style={{ fontSize: 9, fontFamily: "'Geist Mono', monospace" }}
        >
          {lang}
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto overflow-x-auto min-h-0"
        tabIndex={0}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <span
              className="text-stone-600 text-[10px]"
              style={{ fontFamily: "'Geist Mono', monospace" }}
            >
              Loading...
            </span>
          </div>
        ) : content !== null ? (
          <pre
            className="text-stone-300 p-3 text-[10px] leading-relaxed whitespace-pre"
            style={{ fontFamily: "'Geist Mono', 'Fira Code', monospace" }}
          >
            {content}
          </pre>
        ) : (
          <div className="flex items-center justify-center h-full">
            <span
              className="text-stone-600 text-[10px]"
              style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
            >
              Unable to read file
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const ProjectFiles: React.FC = () => {
  const fileTree = useFileStore((s) => s.fileTree);
  const expandedPaths = useFileStore((s) => s.expandedPaths);
  const selectedFile = useFileStore((s) => s.selectedFile);
  const touchedFiles = useFileStore((s) => s.touchedFiles);
  const cwd = useFileStore((s) => s.cwd);
  const inlineEdit = useFileStore((s) => s.inlineEdit);

  const toggleExpanded = useFileStore((s) => s.toggleExpanded);
  const selectFile = useFileStore((s) => s.selectFile);
  const addTouchedFile = useFileStore((s) => s.addTouchedFile);
  const insertFileEntry = useFileStore((s) => s.insertFileEntry);
  const removeFileEntry = useFileStore((s) => s.removeFileEntry);
  const startInlineEdit = useFileStore((s) => s.startInlineEdit);
  const cancelInlineEdit = useFileStore((s) => s.cancelInlineEdit);
  const renameFileEntry = useFileStore((s) => s.renameFileEntry);

  const [topPct, setTopPct] = useState(60);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    entry: FileEntry;
    siblings: FileEntry[];
  } | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);
  const win = window as ClaudeWindow;

  // Subscribe to CWD file-change events from the main process.
  useEffect(() => {
    if (!cwd) return;

    win.claude?.watchCwd?.(cwd).catch(() => {});

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
  }, [cwd, addTouchedFile, insertFileEntry, removeFileEntry]);

  // Load file content when selection changes.
  useEffect(() => {
    if (!selectedFile) {
      setFileContent(null);
      return;
    }
    if (!win.claude?.readFile) {
      setFileContent(null);
      return;
    }
    setContentLoading(true);
    const absolutePath = cwd ? `${cwd}/${selectedFile}` : selectedFile;
    win.claude
      .readFile(absolutePath)
      .then((text) => setFileContent(text))
      .catch(() => setFileContent(null))
      .finally(() => setContentLoading(false));
  }, [selectedFile, cwd]);

  // ── Keyboard shortcuts for the tree ───────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // F2 = Rename
      if (e.key === "F2" && selectedFile) {
        e.preventDefault();
        startInlineEdit({ mode: "rename", targetPath: selectedFile });
      }
      // Cmd+Backspace = Delete
      if ((e.metaKey || e.ctrlKey) && e.key === "Backspace" && selectedFile) {
        e.preventDefault();
        handleDelete(selectedFile);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedFile]);

  // ── Determine the parent directory for new file/folder ────────────────────
  const getCreateTarget = useCallback((): string => {
    if (!selectedFile) return "";
    // If the selected item is a directory and is expanded, create inside it.
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
    // Otherwise create in the parent directory.
    const lastSlash = selectedFile.lastIndexOf("/");
    return lastSlash > 0 ? selectedFile.substring(0, lastSlash) : "";
  }, [selectedFile, fileTree, expandedPaths]);

  // ── New File / New Folder handlers ────────────────────────────────────────
  const handleNewFile = useCallback(() => {
    const target = getCreateTarget();
    startInlineEdit({ mode: "create-file", targetPath: target });
  }, [getCreateTarget, startInlineEdit]);

  const handleNewFolder = useCallback(() => {
    const target = getCreateTarget();
    startInlineEdit({ mode: "create-folder", targetPath: target });
  }, [getCreateTarget, startInlineEdit]);

  // ── Inline edit confirm ───────────────────────────────────────────────────
  const handleInlineConfirm = useCallback(
    async (name: string) => {
      if (!cwd || !inlineEdit) return;

      if (inlineEdit.mode === "rename") {
        // Rename: compute old and new absolute paths.
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
        // Create file or folder.
        // Support nested paths: typing "src/components/Button.tsx" creates all dirs.
        const parentRelative = inlineEdit.targetPath;
        const newRelative = parentRelative ? `${parentRelative}/${name}` : name;
        const absolute = `${cwd}/${newRelative}`;

        if (inlineEdit.mode === "create-folder") {
          await win.claude?.createDir?.(absolute);
          // The chokidar watcher will pick up the new directory.
        } else {
          await win.claude?.createFile?.(absolute);
          // The chokidar watcher will pick up the new file.
          // Auto-select it.
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

  // ── Delete handler ────────────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (filePath: string) => {
      if (!cwd) return;
      const name = filePath.split("/").pop() ?? filePath;
      const confirmed = window.confirm(`Move "${name}" to Trash?`);
      if (!confirmed) return;

      const absolute = `${cwd}/${filePath}`;
      const result = await win.claude?.trashFile?.(absolute);
      if (result?.ok) {
        // Watcher will handle removal, but also clear selection.
        if (selectedFile === filePath) {
          selectFile(null);
        }
      }
    },
    [cwd, selectedFile, selectFile, win.claude],
  );

  // ── Context menu handler ──────────────────────────────────────────────────
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, entry: FileEntry, siblings: FileEntry[]) => {
      setCtxMenu({ x: e.clientX, y: e.clientY, entry, siblings });
    },
    [],
  );

  const handleSelectFile = useCallback(
    (path: string) => selectFile(path),
    [selectFile],
  );
  const handleDividerDrag = useCallback((pct: number) => setTopPct(pct), []);
  const handleOpenInEditor = useCallback(() => {
    if (!selectedFile) return;
    const absolute = cwd ? `${cwd}/${selectedFile}` : selectedFile;
    win.claude?.openInEditor?.(absolute).catch(() => {});
  }, [selectedFile, cwd]);

  const touchedCount = useMemo(() => touchedFiles.size, [touchedFiles]);

  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <Header
        cwd={cwd}
        touchedCount={touchedCount}
        selectedFile={selectedFile}
        onOpenInEditor={handleOpenInEditor}
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

        {/* Code viewer pane */}
        <div
          className="min-h-0 flex flex-col overflow-hidden"
          style={{ height: `${100 - topPct}%` }}
        >
          <CodeViewer
            filePath={selectedFile}
            content={fileContent}
            loading={contentLoading}
          />
        </div>
      </div>

      {/* Context menu portal */}
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
            if (ctxMenu.entry.isDirectory) {
              toggleExpanded(ctxMenu.entry.path);
            }
            startInlineEdit({ mode: "create-file", targetPath: target });
          }}
          onNewFolder={() => {
            const target = ctxMenu.entry.isDirectory
              ? ctxMenu.entry.path
              : ctxMenu.entry.path.substring(
                  0,
                  ctxMenu.entry.path.lastIndexOf("/"),
                ) || "";
            if (ctxMenu.entry.isDirectory) {
              toggleExpanded(ctxMenu.entry.path);
            }
            startInlineEdit({ mode: "create-folder", targetPath: target });
          }}
          onRename={() => {
            startInlineEdit({
              mode: "rename",
              targetPath: ctxMenu.entry.path,
            });
          }}
          onDelete={() => handleDelete(ctxMenu.entry.path)}
          onCopyPath={() => {
            const abs = cwd
              ? `${cwd}/${ctxMenu.entry.path}`
              : ctxMenu.entry.path;
            navigator.clipboard.writeText(abs).catch(() => {});
          }}
          onCopyRelativePath={() => {
            navigator.clipboard.writeText(ctxMenu.entry.path).catch(() => {});
          }}
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

export default ProjectFiles;
