/**
 * ProjectFiles — Info Tabs "Files" tab content.
 *
 * Shows the project file tree for the current session CWD. Files Claude has
 * touched are highlighted with a peach/amber indicator. Clicking a file opens
 * a read-only code viewer pane below. An "Open in VS Code" button launches the
 * file in the user's editor via the preload bridge.
 *
 * Layout (top → bottom):
 *   Header: CWD + touched file count badge + VS Code button
 *   File tree (TreeView, ~60% of body)
 *   Divider (draggable)
 *   Code viewer (read-only, ~40% of body)
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
  Code2,
  ExternalLink,
  FileCode,
  File as FileIcon,
} from "lucide-react";
import { useFileStore } from "../../stores/file-store";
import TreeView from "../shared/TreeView";

// ─── Window API type ──────────────────────────────────────────────────────────

type ClaudeWindow = Window & {
  claude?: {
    openInEditor?: (absolutePath: string) => Promise<void>;
    readFile?: (absolutePath: string) => Promise<string>;
    watchCwd?: (cwd: string) => Promise<void>;
    onCwdFileChanged?: (
      cb: (payload: { event: string; filePath: string }) => void,
    ) => () => void;
  };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Return a syntax-highlight language name from a file extension, used for the
 * code viewer label only (no external highlight library required).
 */
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
}

const Header: React.FC<HeaderProps> = ({
  cwd,
  touchedCount,
  selectedFile,
  onOpenInEditor,
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
      {/* File label bar */}
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

      {/* Content area */}
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

  const toggleExpanded = useFileStore((s) => s.toggleExpanded);
  const selectFile = useFileStore((s) => s.selectFile);
  const addTouchedFile = useFileStore((s) => s.addTouchedFile);

  const [topPct, setTopPct] = useState(60);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  const bodyRef = useRef<HTMLDivElement>(null);

  // Subscribe to CWD file-change events from the main process.
  useEffect(() => {
    const win = window as ClaudeWindow;
    if (!cwd) return;

    win.claude?.watchCwd?.(cwd).catch(() => {
      /* best-effort */
    });

    const unsub = win.claude?.onCwdFileChanged?.((payload) => {
      if (payload.event === "change" || payload.event === "add") {
        addTouchedFile(payload.filePath);
      }
    });
    return () => unsub?.();
  }, [cwd, addTouchedFile]);

  // Load file content when selection changes.
  useEffect(() => {
    if (!selectedFile) {
      setFileContent(null);
      return;
    }

    const win = window as ClaudeWindow;
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

  const handleSelectFile = useCallback(
    (path: string) => {
      selectFile(path);
    },
    [selectFile],
  );

  const handleDividerDrag = useCallback((pct: number) => {
    setTopPct(pct);
  }, []);

  const handleOpenInEditor = useCallback(() => {
    if (!selectedFile) return;
    const win = window as ClaudeWindow;
    const absolute = cwd ? `${cwd}/${selectedFile}` : selectedFile;
    win.claude?.openInEditor?.(absolute).catch(() => {
      /* ignore */
    });
  }, [selectedFile, cwd]);

  const touchedCount = useMemo(() => touchedFiles.size, [touchedFiles]);

  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden"
      style={{ backgroundColor: "#0e0c0b" }}
    >
      <Header
        cwd={cwd}
        touchedCount={touchedCount}
        selectedFile={selectedFile}
        onOpenInEditor={handleOpenInEditor}
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
            onToggleExpand={toggleExpanded}
            onSelectFile={handleSelectFile}
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
    </div>
  );
};

export default ProjectFiles;
