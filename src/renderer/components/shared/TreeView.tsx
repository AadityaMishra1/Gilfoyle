/**
 * TreeView — Recursive file-tree with inline editing, context menu, and
 * keyboard shortcuts. Supports create-file, create-folder, rename, delete,
 * copy path, and reveal in Finder — matching VS Code's file explorer UX.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode,
  FileJson,
  FileText,
  FilePlus,
  FolderPlus,
  Pencil,
  Trash2,
  Copy,
  ExternalLink,
} from "lucide-react";
import type { FileEntry, InlineEditState } from "../../stores/file-store";

// ─── Icon helpers ─────────────────────────────────────────────────────────────

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".vue",
  ".svelte",
]);
const JSON_EXTENSIONS = new Set([".json", ".jsonc", ".jsonl"]);

function getFileIcon(name: string): React.ReactNode {
  const dot = name.lastIndexOf(".");
  const ext = dot !== -1 ? name.slice(dot).toLowerCase() : "";

  if (CODE_EXTENSIONS.has(ext)) {
    return <FileCode size={13} className="shrink-0 text-amber-400/70" />;
  }
  if (JSON_EXTENSIONS.has(ext)) {
    return <FileJson size={13} className="shrink-0 text-yellow-500/70" />;
  }
  return <FileText size={13} className="shrink-0 text-zinc-500" />;
}

// ─── Invalid filename characters (macOS) ──────────────────────────────────────

const INVALID_CHARS = /[\0:]/;

function validateFileName(name: string, siblings: FileEntry[]): string | null {
  if (!name || !name.trim()) return null; // Treat empty as cancel.
  if (INVALID_CHARS.test(name)) return "Invalid character in name";
  if (siblings.some((e) => e.name === name)) return "Name already exists";
  return ""; // Empty string = valid.
}

// ─── Context Menu ─────────────────────────────────────────────────────────────

interface ContextMenuProps {
  x: number;
  y: number;
  isDirectory: boolean;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCopyPath: () => void;
  onCopyRelativePath: () => void;
  onRevealInFinder: () => void;
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  isDirectory,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onCopyPath,
  onCopyRelativePath,
  onRevealInFinder,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", handler);
    window.addEventListener("keydown", keyHandler);
    return () => {
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  const items: Array<{
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    shortcut?: string;
    separator?: boolean;
    danger?: boolean;
  }> = [
    ...(isDirectory
      ? [
          {
            label: "New File",
            icon: <FilePlus size={12} />,
            onClick: onNewFile,
          },
          {
            label: "New Folder",
            icon: <FolderPlus size={12} />,
            onClick: onNewFolder,
            separator: true,
          },
        ]
      : []),
    {
      label: "Rename",
      icon: <Pencil size={12} />,
      onClick: onRename,
      shortcut: "F2",
    },
    {
      label: "Delete",
      icon: <Trash2 size={12} />,
      onClick: onDelete,
      shortcut: "⌘⌫",
      separator: true,
      danger: true,
    },
    {
      label: "Copy Path",
      icon: <Copy size={12} />,
      onClick: onCopyPath,
      shortcut: "⌥⌘C",
    },
    {
      label: "Copy Relative Path",
      icon: <Copy size={12} />,
      onClick: onCopyRelativePath,
      separator: true,
    },
    {
      label: "Reveal in Finder",
      icon: <ExternalLink size={12} />,
      onClick: onRevealInFinder,
    },
  ];

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[180px] py-1 rounded-md border border-stone-700 bg-stone-900 shadow-xl"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => (
        <React.Fragment key={item.label}>
          <button
            type="button"
            className={`flex items-center gap-2 w-full px-3 py-1 text-left text-[11px] transition-colors cursor-pointer ${
              item.danger
                ? "text-red-400 hover:bg-red-500/10"
                : "text-stone-300 hover:bg-stone-700/60"
            }`}
            style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            <span className="shrink-0 text-stone-500">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <span
                className="text-stone-600 text-[9px]"
                style={{ fontFamily: "'Geist Mono', monospace" }}
              >
                {item.shortcut}
              </span>
            )}
          </button>
          {item.separator && i < items.length - 1 && (
            <div className="my-1 border-t border-stone-800" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// ─── Inline Edit Input ────────────────────────────────────────────────────────

interface InlineInputProps {
  defaultValue: string;
  isRename: boolean;
  siblings: FileEntry[];
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

const InlineInput: React.FC<InlineInputProps> = ({
  defaultValue,
  isRename,
  siblings,
  onConfirm,
  onCancel,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();

    if (isRename && defaultValue) {
      // Select only the name portion (not the extension).
      const dot = defaultValue.lastIndexOf(".");
      const end = dot > 0 ? dot : defaultValue.length;
      el.setSelectionRange(0, end);
    } else {
      el.select();
    }
  }, [defaultValue, isRename]);

  const handleConfirm = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      onCancel();
      return;
    }
    // For rename, skip validation if name unchanged.
    if (isRename && trimmed === defaultValue) {
      onCancel();
      return;
    }
    // Filter out the current entry from siblings when renaming.
    const filteredSiblings = isRename
      ? siblings.filter((e) => e.name !== defaultValue)
      : siblings;
    const err = validateFileName(trimmed, filteredSiblings);
    if (err === null) {
      onCancel();
      return;
    }
    if (err) {
      setError(err);
      return;
    }
    onConfirm(trimmed);
  }, [value, isRename, defaultValue, siblings, onConfirm, onCancel]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleConfirm();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
          e.stopPropagation();
        }}
        onBlur={handleConfirm}
        className={`w-full bg-stone-800 text-stone-200 text-xs px-1.5 py-0 rounded-sm outline-none border ${
          error ? "border-red-500" : "border-amber-500/60"
        }`}
        style={{
          fontFamily: "'Geist Mono', monospace",
          lineHeight: "20px",
          height: 20,
        }}
        spellCheck={false}
        autoComplete="off"
      />
      {error && (
        <div
          className="absolute left-0 top-full mt-0.5 px-1.5 py-0.5 bg-red-950 border border-red-800 rounded text-red-300 text-[9px] z-50 whitespace-nowrap"
          style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
        >
          {error}
        </div>
      )}
    </div>
  );
};

// ─── TreeNode ─────────────────────────────────────────────────────────────────

interface TreeNodeProps {
  entry: FileEntry;
  depth: number;
  expandedPaths: Set<string>;
  selectedFile: string | null;
  touchedFiles: Set<string>;
  inlineEdit: InlineEditState | null;
  onToggleExpand: (path: string) => void;
  onSelectFile: (path: string) => void;
  onContextMenu: (
    e: React.MouseEvent,
    entry: FileEntry,
    siblings: FileEntry[],
  ) => void;
  onInlineConfirm: (name: string) => void;
  onInlineCancel: () => void;
  onDropMove?: (sourcePath: string, targetDirPath: string) => void;
  onExternalDrop?: (absolutePaths: string[], targetDirPath: string) => void;
  siblings: FileEntry[];
}

const TreeNode: React.FC<TreeNodeProps> = ({
  entry,
  depth,
  expandedPaths,
  selectedFile,
  touchedFiles,
  inlineEdit,
  onToggleExpand,
  onSelectFile,
  onContextMenu,
  onInlineConfirm,
  onInlineCancel,
  onDropMove,
  onExternalDrop,
  siblings,
}) => {
  const isExpanded = expandedPaths.has(entry.path);
  const isSelected = selectedFile === entry.path;
  const isTouched = touchedFiles.has(entry.path);
  const [dragOver, setDragOver] = useState(false);
  const isRenaming =
    inlineEdit?.mode === "rename" && inlineEdit.targetPath === entry.path;

  // Check if a new file/folder should be created inside THIS directory.
  const isCreateTarget =
    entry.isDirectory &&
    isExpanded &&
    inlineEdit !== null &&
    inlineEdit.mode !== "rename" &&
    inlineEdit.targetPath === entry.path;

  const handleClick = useCallback(() => {
    if (entry.isDirectory) {
      onToggleExpand(entry.path);
    } else {
      onSelectFile(entry.path);
    }
  }, [entry.isDirectory, entry.path, onToggleExpand, onSelectFile]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu(e, entry, siblings);
    },
    [entry, siblings, onContextMenu],
  );

  // ── Drag and drop ──────────────────────────────────────────────────────
  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.dataTransfer.setData("text/plain", entry.path);
      e.dataTransfer.effectAllowed = "move";
    },
    [entry.path],
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!entry.isDirectory) return;
      // Accept internal tree drags OR external file drops from Finder/Explorer.
      const isInternal = e.dataTransfer.types.includes("text/plain");
      const isExternal = e.dataTransfer.types.includes("Files");
      if (!isInternal && !isExternal) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = isExternal ? "copy" : "move";
      setDragOver(true);
    },
    [entry.isDirectory],
  );

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (!entry.isDirectory) return;

      // External file drop from Finder/Explorer.
      if (e.dataTransfer.files.length > 0 && onExternalDrop) {
        const claude = (
          window as Window & {
            claude?: { getPathForFile?: (f: File) => string };
          }
        ).claude;
        const paths: string[] = [];
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          const file = e.dataTransfer.files[i];
          if (!file) continue;
          // Use Electron's webUtils.getPathForFile via preload bridge.
          const p = claude?.getPathForFile?.(file);
          if (p) paths.push(p);
        }
        if (paths.length > 0) {
          onExternalDrop(paths, entry.path);
        }
        return;
      }

      // Internal tree drag-and-drop move.
      if (!onDropMove) return;
      const sourcePath = e.dataTransfer.getData("text/plain");
      if (!sourcePath) return;
      if (sourcePath === entry.path) return;
      if (entry.path.startsWith(sourcePath + "/")) return;
      const sourceParent = sourcePath.includes("/")
        ? sourcePath.substring(0, sourcePath.lastIndexOf("/"))
        : "";
      if (sourceParent === entry.path) return;
      onDropMove(sourcePath, entry.path);
    },
    [entry.isDirectory, entry.path, onDropMove, onExternalDrop],
  );

  // Build row background — selected takes priority over touched.
  let rowBg = "hover:bg-zinc-800/60";
  if (dragOver) {
    rowBg = "bg-blue-500/20 ring-1 ring-blue-500/40";
  } else if (isSelected) {
    rowBg = "bg-amber-500/15 hover:bg-amber-500/20";
  } else if (isTouched) {
    rowBg = "bg-amber-900/10 hover:bg-amber-900/20";
  }

  return (
    <div
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={entry.isDirectory ? isExpanded : undefined}
    >
      {/* Row */}
      <div
        className={`flex items-center gap-1.5 py-0.5 cursor-pointer select-none rounded-sm ${rowBg} transition-colors duration-75`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        draggable={!isRenaming}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        tabIndex={0}
        aria-label={entry.name}
      >
        {/* Chevron for directories */}
        {entry.isDirectory ? (
          <span className="text-zinc-500 shrink-0" aria-hidden="true">
            {isExpanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
          </span>
        ) : (
          <span className="shrink-0" style={{ width: 12 }} aria-hidden="true" />
        )}

        {/* Icon */}
        <span aria-hidden="true">
          {entry.isDirectory ? (
            isExpanded ? (
              <FolderOpen size={13} className="shrink-0 text-amber-400/80" />
            ) : (
              <Folder size={13} className="shrink-0 text-zinc-400/70" />
            )
          ) : (
            getFileIcon(entry.name)
          )}
        </span>

        {/* Name or inline rename input */}
        {isRenaming ? (
          <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
            <InlineInput
              defaultValue={entry.name}
              isRename
              siblings={siblings}
              onConfirm={onInlineConfirm}
              onCancel={onInlineCancel}
            />
          </div>
        ) : (
          <span
            className={`text-xs truncate ${
              isSelected
                ? "text-amber-300 font-medium"
                : isTouched
                  ? "text-amber-400/90"
                  : "text-zinc-400"
            }`}
            style={{ fontFamily: "'Geist Mono', monospace" }}
            title={entry.path}
          >
            {entry.name}
          </span>
        )}

        {/* Touched badge */}
        {isTouched && !entry.isDirectory && !isRenaming && (
          <span
            className="ml-auto mr-2 shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400"
            title="Modified by Claude"
            aria-label="Modified by Claude"
          />
        )}
      </div>

      {/* Inline create row (appears first inside an expanded directory) */}
      {isCreateTarget && (
        <div
          className="flex items-center gap-1.5 py-0.5"
          style={{ paddingLeft: 8 + (depth + 1) * 16 }}
        >
          <span className="shrink-0" style={{ width: 12 }} />
          <span aria-hidden="true">
            {inlineEdit.mode === "create-folder" ? (
              <Folder size={13} className="shrink-0 text-amber-400/80" />
            ) : (
              <FileText size={13} className="shrink-0 text-zinc-500" />
            )}
          </span>
          <div className="flex-1 min-w-0">
            <InlineInput
              defaultValue=""
              isRename={false}
              siblings={entry.children ?? []}
              onConfirm={onInlineConfirm}
              onCancel={onInlineCancel}
            />
          </div>
        </div>
      )}

      {/* Children — rendered only when expanded */}
      {entry.isDirectory &&
        isExpanded &&
        entry.children !== undefined &&
        entry.children.length > 0 && (
          <div role="group">
            {entry.children.map((child) => (
              <TreeNode
                key={child.path}
                entry={child}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                selectedFile={selectedFile}
                touchedFiles={touchedFiles}
                inlineEdit={inlineEdit}
                onToggleExpand={onToggleExpand}
                onSelectFile={onSelectFile}
                onContextMenu={onContextMenu}
                onInlineConfirm={onInlineConfirm}
                onInlineCancel={onInlineCancel}
                onDropMove={onDropMove}
                onExternalDrop={onExternalDrop}
                siblings={entry.children!}
              />
            ))}
          </div>
        )}

      {/* Empty directory placeholder (only when not creating) */}
      {entry.isDirectory &&
        isExpanded &&
        !isCreateTarget &&
        (entry.children === undefined || entry.children.length === 0) && (
          <div
            className="text-zinc-700 text-xs py-0.5"
            style={{
              paddingLeft: 8 + (depth + 1) * 16,
              fontFamily: "'Geist Mono', monospace",
            }}
          >
            empty
          </div>
        )}
    </div>
  );
};

// ─── Public component ─────────────────────────────────────────────────────────

export interface TreeViewProps {
  entries: FileEntry[];
  expandedPaths: Set<string>;
  selectedFile: string | null;
  touchedFiles: Set<string>;
  inlineEdit?: InlineEditState | null;
  onToggleExpand: (path: string) => void;
  onSelectFile: (path: string) => void;
  onContextMenu?: (
    e: React.MouseEvent,
    entry: FileEntry,
    siblings: FileEntry[],
  ) => void;
  onInlineConfirm?: (name: string) => void;
  onInlineCancel?: () => void;
  /** Called when a file/folder is drag-dropped onto a directory. */
  onDropMove?: (sourcePath: string, targetDirPath: string) => void;
  /** Called when external files (from Finder/Explorer) are dropped onto a directory. */
  onExternalDrop?: (absolutePaths: string[], targetDirPath: string) => void;
}

const TreeView: React.FC<TreeViewProps> = ({
  entries,
  expandedPaths,
  selectedFile,
  touchedFiles,
  inlineEdit = null,
  onToggleExpand,
  onSelectFile,
  onContextMenu = () => {},
  onInlineConfirm = () => {},
  onInlineCancel = () => {},
  onDropMove,
  onExternalDrop,
}) => {
  // Root-level inline create (when targetPath is empty = root).
  const isRootCreate =
    inlineEdit !== null &&
    inlineEdit.mode !== "rename" &&
    inlineEdit.targetPath === "";

  if (entries.length === 0 && !isRootCreate) {
    return (
      <div
        className="flex items-center justify-center h-24 text-zinc-600 text-xs"
        style={{ fontFamily: "'Geist Mono', monospace" }}
      >
        No files
      </div>
    );
  }

  // Root-level drop handler for external files dropped outside any folder.
  const handleRootDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleRootDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (e.dataTransfer.files.length > 0 && onExternalDrop) {
        e.preventDefault();
        const claude = (
          window as Window & {
            claude?: { getPathForFile?: (f: File) => string };
          }
        ).claude;
        const paths: string[] = [];
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          const file = e.dataTransfer.files[i];
          if (!file) continue;
          const p = claude?.getPathForFile?.(file);
          if (p) paths.push(p);
        }
        if (paths.length > 0) {
          onExternalDrop(paths, "");
        }
      }
    },
    [onExternalDrop],
  );

  return (
    <div
      role="tree"
      aria-label="File tree"
      className="py-1"
      onDragOver={handleRootDragOver}
      onDrop={handleRootDrop}
    >
      {/* Root-level inline create row */}
      {isRootCreate && (
        <div
          className="flex items-center gap-1.5 py-0.5"
          style={{ paddingLeft: 8 }}
        >
          <span className="shrink-0" style={{ width: 12 }} />
          <span aria-hidden="true">
            {inlineEdit!.mode === "create-folder" ? (
              <Folder size={13} className="shrink-0 text-amber-400/80" />
            ) : (
              <FileText size={13} className="shrink-0 text-zinc-500" />
            )}
          </span>
          <div className="flex-1 min-w-0">
            <InlineInput
              defaultValue=""
              isRename={false}
              siblings={entries}
              onConfirm={onInlineConfirm}
              onCancel={onInlineCancel}
            />
          </div>
        </div>
      )}
      {entries.map((entry) => (
        <TreeNode
          key={entry.path}
          entry={entry}
          depth={0}
          expandedPaths={expandedPaths}
          selectedFile={selectedFile}
          touchedFiles={touchedFiles}
          inlineEdit={inlineEdit}
          onToggleExpand={onToggleExpand}
          onSelectFile={onSelectFile}
          onContextMenu={onContextMenu}
          onInlineConfirm={onInlineConfirm}
          onInlineCancel={onInlineCancel}
          onDropMove={onDropMove}
          onExternalDrop={onExternalDrop}
          siblings={entries}
        />
      ))}
    </div>
  );
};

export { ContextMenu };
export default TreeView;
