import React, { useCallback } from "react";
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
import TreeView from "../shared/TreeView";

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
  const toggleExpanded = useFileStore((s) => s.toggleExpanded);
  const selectFile = useFileStore((s) => s.selectFile);
  const setOpenFile = useFileStore((s) => s.setOpenFile);
  const cwd = useFileStore((s) => s.cwd);
  const [collapsed, setCollapsed] = React.useState(false);

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

  if (fileTree.length === 0) return null;

  return (
    <div className="flex flex-col min-h-0">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-1 px-3 py-1.5 shrink-0 text-stone-600 hover:text-stone-400 transition-colors"
      >
        {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
        <span
          className="uppercase tracking-widest font-medium"
          style={{ fontSize: 10 }}
        >
          Files
        </span>
      </button>

      {!collapsed && (
        <div className="overflow-y-auto min-h-0" style={{ maxHeight: 300 }}>
          <TreeView
            entries={fileTree}
            expandedPaths={expandedPaths}
            selectedFile={selectedFile}
            touchedFiles={touchedFiles}
            onToggleExpand={toggleExpanded}
            onSelectFile={handleFileClick}
          />
        </div>
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
      className="flex flex-col shrink-0"
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

        <div className="overflow-y-auto min-h-0" style={{ maxHeight: 280 }}>
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
      {activeProjectPath && <FilesSidebar />}
      {activeProjectPath && <div className="border-t border-stone-800 mx-0" />}

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
