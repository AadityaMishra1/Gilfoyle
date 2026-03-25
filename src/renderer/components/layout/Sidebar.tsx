import React, { useCallback, useState } from "react";
import {
  Folder,
  FolderOpen,
  Plus,
  BookOpen,
  Plug,
  Zap,
  X,
  ChevronDown,
  ChevronRight,
  FilePlus,
  FolderPlus,
} from "lucide-react";
import {
  useProjectStore,
  makeProject,
  type Project,
} from "../../stores/project-store";
import { useFileStore } from "../../stores/file-store";
import { useClaudeAPI } from "../../hooks/use-ipc";
import { useLayoutStore } from "../../stores/layout-store";
import { UsageDetails } from "../usage/UsageDetails";
import { useDiscoverStore } from "../../stores/discover-store";
import { useTabStore } from "../../stores/tab-store";
import DiscoverPanel from "../discover/DiscoverPanel";
import TreeView, { ContextMenu } from "../shared/TreeView";
import type { FileEntry } from "../../stores/file-store";

// ─── Discover Section ─────────────────────────────────────────────────────────

interface DiscoverRow {
  label: string;
  icon: React.ReactNode;
  count: number;
  category: string;
}

const DISCOVER_ROWS: DiscoverRow[] = [
  {
    label: "Skills",
    icon: <BookOpen size={13} />,
    count: 0,
    category: "skills",
  },
  { label: "Plugins", icon: <Plug size={13} />, count: 0, category: "all" },
  { label: "Hooks", icon: <Zap size={13} />, count: 0, category: "hooks" },
];

// ─── Project Row ──────────────────────────────────────────────────────────────

interface ProjectRowProps {
  project: Project;
  isActive: boolean;
  onClick: () => void;
  onRemove: () => void;
}

const ProjectRow: React.FC<ProjectRowProps> = ({
  project,
  isActive,
  onClick,
  onRemove,
}) => {
  return (
    <div
      className="group w-full flex items-center gap-2 px-3 rounded transition-colors cursor-pointer"
      style={{
        height: 32,
        backgroundColor: isActive
          ? "var(--accent-glow, rgba(232,168,114,0.06))"
          : undefined,
        borderLeft: isActive
          ? "2px solid var(--accent-primary)"
          : "2px solid transparent",
        paddingLeft: isActive ? 10 : 12,
      }}
      title={project.path}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
    >
      <span
        style={{
          color: isActive ? "var(--accent-primary)" : "var(--text-muted)",
        }}
      >
        {isActive ? <FolderOpen size={14} /> : <Folder size={14} />}
      </span>

      <span
        className="flex-1 text-xs truncate text-left"
        style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          color: isActive ? "var(--accent-primary)" : "var(--text-secondary)",
        }}
      >
        {project.name}
      </span>

      {project.sessionCount > 0 && (
        <span
          className="shrink-0 rounded text-stone-500 bg-stone-800 px-1 leading-none group-hover:hidden"
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 9,
            paddingTop: 2,
            paddingBottom: 2,
          }}
        >
          {project.sessionCount === 1
            ? "1 session"
            : `${project.sessionCount} sessions`}
        </span>
      )}

      <span
        role="button"
        tabIndex={0}
        aria-label={`Remove ${project.name}`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation();
            onRemove();
          }
        }}
        className="hidden group-hover:flex shrink-0 items-center justify-center w-4 h-4 rounded text-stone-600 hover:text-stone-300 hover:bg-stone-700/60 transition-colors"
      >
        <X size={10} />
      </span>
    </div>
  );
};

// ─── Files Section ────────────────────────────────────────────────────────────

const FilesSidebar: React.FC = () => {
  const claude = useClaudeAPI();
  const fileTree = useFileStore((s) => s.fileTree);
  const expandedPaths = useFileStore((s) => s.expandedPaths);
  const selectedFile = useFileStore((s) => s.selectedFile);
  const touchedFiles = useFileStore((s) => s.touchedFiles);
  const inlineEdit = useFileStore((s) => s.inlineEdit);
  const toggleExpanded = useFileStore((s) => s.toggleExpanded);
  const selectFile = useFileStore((s) => s.selectFile);
  const setOpenFile = useFileStore((s) => s.setOpenFile);
  const startInlineEdit = useFileStore((s) => s.startInlineEdit);
  const cancelInlineEdit = useFileStore((s) => s.cancelInlineEdit);
  const renameFileEntry = useFileStore((s) => s.renameFileEntry);
  const insertFileEntry = useFileStore((s) => s.insertFileEntry);
  const cwd = useFileStore((s) => s.cwd);
  const [collapsed, setCollapsed] = React.useState(false);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    entry: FileEntry;
    siblings: FileEntry[];
  } | null>(null);

  const win = window as Window & { claude?: Record<string, unknown> };

  const handleFileClick = useCallback(
    async (filePath: string) => {
      selectFile(filePath);
      if (!cwd) return;
      const fullPath = cwd + "/" + filePath;
      try {
        const content = await claude.readFile(fullPath);
        if (content !== null) {
          setOpenFile(fullPath, content);
        }
      } catch {
        // ignore
      }
    },
    [selectFile, cwd, claude, setOpenFile],
  );

  // Determine parent directory for new file/folder creation.
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

  // Inline edit confirm handler.
  const handleInlineConfirm = useCallback(
    async (name: string) => {
      if (!cwd || !inlineEdit) return;
      const api = win.claude as
        | {
            createFile?: (p: string) => Promise<{ ok: boolean }>;
            createDir?: (p: string) => Promise<{ ok: boolean }>;
            renameFile?: (o: string, n: string) => Promise<{ ok: boolean }>;
          }
        | undefined;

      if (inlineEdit.mode === "rename") {
        const oldRelative = inlineEdit.targetPath;
        const lastSlash = oldRelative.lastIndexOf("/");
        const parentRelative =
          lastSlash > 0 ? oldRelative.substring(0, lastSlash) : "";
        const newRelative = parentRelative ? `${parentRelative}/${name}` : name;
        const result = await api?.renameFile?.(
          `${cwd}/${oldRelative}`,
          `${cwd}/${newRelative}`,
        );
        if (result?.ok) {
          renameFileEntry(oldRelative, newRelative);
        }
      } else {
        const parentRelative = inlineEdit.targetPath;
        const newRelative = parentRelative ? `${parentRelative}/${name}` : name;
        const absolute = `${cwd}/${newRelative}`;
        if (inlineEdit.mode === "create-folder") {
          await api?.createDir?.(absolute);
          insertFileEntry(newRelative, true);
        } else {
          await api?.createFile?.(absolute);
          insertFileEntry(newRelative, false);
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
      insertFileEntry,
      selectFile,
      cancelInlineEdit,
    ],
  );

  // Delete handler.
  const handleDelete = useCallback(
    async (filePath: string) => {
      if (!cwd) return;
      const entryName = filePath.split("/").pop() ?? filePath;
      const confirmed = window.confirm(`Move "${entryName}" to Trash?`);
      if (!confirmed) return;
      const api = win.claude as
        | {
            trashFile?: (p: string) => Promise<{ ok: boolean }>;
          }
        | undefined;
      const result = await api?.trashFile?.(`${cwd}/${filePath}`);
      if (result?.ok && selectedFile === filePath) {
        selectFile(null);
      }
    },
    [cwd, selectedFile, selectFile, win.claude],
  );

  // Drag-and-drop move handler.
  const handleDropMove = useCallback(
    async (sourcePath: string, targetDirPath: string) => {
      if (!cwd) return;
      const fileName = sourcePath.split("/").pop() ?? sourcePath;
      const newRelative = `${targetDirPath}/${fileName}`;
      const api = win.claude as
        | { renameFile?: (o: string, n: string) => Promise<{ ok: boolean }> }
        | undefined;
      const result = await api?.renameFile?.(
        `${cwd}/${sourcePath}`,
        `${cwd}/${newRelative}`,
      );
      if (result?.ok) {
        renameFileEntry(sourcePath, newRelative);
      }
    },
    [cwd, win.claude, renameFileEntry],
  );

  // External file drop handler (from Finder/Explorer).
  const handleExternalDrop = useCallback(
    async (absolutePaths: string[], targetDirPath: string) => {
      if (!cwd) return;
      const destAbsolute = targetDirPath ? `${cwd}/${targetDirPath}` : cwd;
      const api = win.claude as
        | {
            copyFilesInto?: (
              srcs: string[],
              dest: string,
            ) => Promise<Array<{ src: string; ok: boolean }>>;
          }
        | undefined;
      await api?.copyFilesInto?.(absolutePaths, destAbsolute);
      // Chokidar watcher will pick up the new files automatically.
    },
    [cwd, win.claude],
  );

  // Context menu handler.
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, entry: FileEntry, siblings: FileEntry[]) => {
      setCtxMenu({ x: e.clientX, y: e.clientY, entry, siblings });
    },
    [],
  );

  if (fileTree.length === 0 && !inlineEdit) return null;

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Header row with collapse toggle + new file/folder buttons */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1 px-3 py-1.5 text-stone-600 hover:text-stone-400 transition-colors"
        >
          {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
          <span
            className="uppercase tracking-widest font-medium"
            style={{ fontSize: 10 }}
          >
            Files
          </span>
        </button>
        {!collapsed && cwd && (
          <div className="flex items-center gap-0.5 ml-auto mr-2">
            <button
              type="button"
              onClick={handleNewFile}
              className="p-0.5 rounded text-stone-600 hover:text-stone-300 hover:bg-stone-700/50 transition-colors cursor-pointer"
              title="New File"
            >
              <FilePlus size={12} />
            </button>
            <button
              type="button"
              onClick={handleNewFolder}
              className="p-0.5 rounded text-stone-600 hover:text-stone-300 hover:bg-stone-700/50 transition-colors cursor-pointer"
              title="New Folder"
            >
              <FolderPlus size={12} />
            </button>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="overflow-y-auto flex-1 min-h-0">
          <TreeView
            entries={fileTree}
            expandedPaths={expandedPaths}
            selectedFile={selectedFile}
            touchedFiles={touchedFiles}
            inlineEdit={inlineEdit}
            onToggleExpand={toggleExpanded}
            onSelectFile={handleFileClick}
            onContextMenu={handleContextMenu}
            onInlineConfirm={handleInlineConfirm}
            onInlineCancel={cancelInlineEdit}
            onDropMove={handleDropMove}
            onExternalDrop={handleExternalDrop}
          />
        </div>
      )}

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
            const api = win.claude as
              | {
                  revealInFinder?: (p: string) => Promise<void>;
                }
              | undefined;
            api?.revealInFinder?.(abs).catch(() => {});
          }}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
};

// ─── Main Sidebar ─────────────────────────────────────────────────────────────

const Sidebar: React.FC = () => {
  const claude = useClaudeAPI();
  const { sidebarWidth } = useLayoutStore();
  const {
    projects,
    activeProjectPath,
    setActiveProject,
    addProject,
    removeProject,
  } = useProjectStore();

  const setDiscoverOpen = useDiscoverStore((s) => s.setDiscoverOpen);
  const setActiveCategory = useDiscoverStore((s) => s.setActiveCategory);

  // Show only projects that have been opened this session (booted in tab store)
  const bootedProjects = useTabStore((s) => s.bootedProjects);
  const openProjects = projects.filter(
    (p) => bootedProjects.has(p.path) || p.path === activeProjectPath,
  );

  const handleOpenFolder = useCallback(async () => {
    try {
      const folderPath = await claude.openFolderDialog();
      if (folderPath) {
        addProject(makeProject(folderPath));
        setActiveProject(folderPath);
      }
    } catch (err) {
      console.warn("[Sidebar] openFolderDialog failed:", err);
    }
  }, [claude, addProject, setActiveProject]);

  return (
    <div
      className="flex flex-col shrink-0 h-full"
      style={{
        width: sidebarWidth,
        backgroundColor: "var(--bg-sidebar)",
        userSelect: "none",
        transition: "background-color 0.2s ease",
      }}
    >
      {/* ── PROJECTS ─────────────────────────────────────────────────── */}
      <div className="flex flex-col min-h-0">
        <div className="px-3 pt-3 pb-1.5 shrink-0">
          <span
            className="text-stone-600 uppercase tracking-widest font-medium"
            style={{ fontSize: 10 }}
          >
            Projects
          </span>
        </div>

        <div className="overflow-y-auto min-h-0 max-h-[30vh]">
          {openProjects.length === 0 ? (
            <div
              className="px-3 py-2 text-stone-600 italic"
              style={{ fontSize: 11 }}
            >
              No project open
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 px-1 pb-1">
              {openProjects.map((project) => (
                <ProjectRow
                  key={project.path}
                  project={project}
                  isActive={project.path === activeProjectPath}
                  onClick={() => setActiveProject(project.path)}
                  onRemove={() => removeProject(project.path)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="px-2 pb-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleOpenFolder()}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-stone-500 hover:text-stone-300 hover:bg-stone-800 transition-colors"
            style={{ fontSize: 11 }}
          >
            <Plus size={12} />
            <span>Open Folder</span>
          </button>
        </div>
      </div>

      <div className="border-t border-stone-800 mx-0" />

      {/* ── FILES (only when a project is active) ──────────────────── */}
      {activeProjectPath && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <FilesSidebar />
        </div>
      )}
      {activeProjectPath && <div className="border-t border-stone-800 mx-0" />}
      {!activeProjectPath && <div className="flex-1" />}

      {/* ── USAGE ────────────────────────────────────────────────────── */}
      <div className="shrink-0">
        <UsageDetails />
      </div>

      <div className="border-t border-stone-800 mx-0" />

      {/* ── DISCOVER ─────────────────────────────────────────────────── */}
      <div className="shrink-0 py-2">
        <div className="px-3 pb-1">
          <span
            className="text-stone-600 uppercase tracking-widest font-medium"
            style={{ fontSize: 10 }}
          >
            Discover
          </span>
        </div>

        <div className="flex flex-col gap-0.5 px-1">
          {DISCOVER_ROWS.map((row) => (
            <button
              key={row.label}
              type="button"
              onClick={() => {
                setActiveCategory(row.category);
                setDiscoverOpen(true);
              }}
              className="w-full flex items-center gap-2 px-3 h-8 rounded text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors"
              style={{ fontSize: 12 }}
              title={`Browse ${row.label}`}
            >
              <span className="text-stone-600">{row.icon}</span>
              <span className="flex-1 text-left">{row.label}</span>
            </button>
          ))}
        </div>
      </div>
      <DiscoverPanel />
    </div>
  );
};

export default Sidebar;
