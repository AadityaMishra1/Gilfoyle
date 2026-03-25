import React, { useEffect, useCallback, useState } from "react";

import TitleBar from "./components/layout/TitleBar";
import Sidebar from "./components/layout/Sidebar";
import StatusBar from "./components/layout/StatusBar";
import CommandPalette from "./components/layout/CommandPalette";
import ProjectView from "./components/project/ProjectView";
import OnboardingOverlay from "./components/onboarding/OnboardingOverlay";
import SettingsPanel from "./components/settings/SettingsPanel";
import ResizeDivider from "./components/shared/ResizeDivider";
import ErrorBoundary from "./components/shared/ErrorBoundary";

import { useClaudeAPI } from "./hooks/use-ipc";
import { useDataLoader } from "./hooks/use-data-loader";
import { useLayoutStore } from "./stores/layout-store";
import { useUIStore } from "./stores/ui-store";
import {
  useProjectStore,
  makeProject,
  type Project,
} from "./stores/project-store";
import { useTabStore } from "./stores/tab-store";
import { useSettingsStore } from "./stores/settings-store";

/**
 * Root application shell — project-centric layout.
 *
 * ┌─────────────────────────────────────────────────────┐
 * │  TitleBar  ·  ~/myapp  ·  ████░░ 67% usage         │
 * ├──────────┬──────────────────────────────────────────┤
 * │          │                                          │
 * │ PROJECTS │   PROJECT VIEW                           │
 * │ USAGE    │   Terminal tabs + Info tabs              │
 * │ DISCOVER │                                          │
 * ├──────────┴──────────────────────────────────────────┤
 * │  opus · 45% ctx · 2 agents · rate: healthy          │
 * └─────────────────────────────────────────────────────┘
 */
const App: React.FC = () => {
  const claude = useClaudeAPI();
  const { toggleSidebar, sidebarWidth, setSidebarWidth, sidebarCollapsed } =
    useLayoutStore();
  const { toggleCommandPalette } = useUIStore();
  const { projects, activeProjectPath, setProjects, setActiveProject } =
    useProjectStore();
  const theme = useSettingsStore((s) => s.theme);
  const bootedProjects = useTabStore((s) => s.bootedProjects);

  // Apply theme data attribute to the root element
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // ── Sidebar resize drag ─────────────────────────────────────────────────
  const handleSidebarDrag = useCallback(
    (deltaX: number) => {
      const current = useLayoutStore.getState().sidebarWidth;
      setSidebarWidth(current + deltaX);
    },
    [setSidebarWidth],
  );

  // Populate all Zustand stores from IPC on startup.
  useDataLoader();

  // ── Scan projects from ~/.claude/projects/ on mount ──────────────────────
  useEffect(() => {
    const scanProjects = async () => {
      try {
        const projectInfos = await claude.getProjects();
        const detected = projectInfos.map((info) => {
          // makeProject derives name and shortPath from the path, then we
          // overwrite sessionCount and lastActiveAt with the real values.
          const base = makeProject(info.path, info.sessionCount);
          return { ...base, lastActiveAt: info.lastActiveAt };
        });
        setProjects(detected);
        // Don't auto-open a project on fresh launch — let the user pick.
        // Only restore the last active project if it was persisted.
      } catch (err) {
        console.warn("[App] Project scan failed:", err);
      }
    };

    void scanProjects();
    // Only run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      // Cmd+\ → toggle sidebar
      if (mod && e.key === "\\") {
        e.preventDefault();
        toggleSidebar();
      }
      // Cmd+K → command palette
      if (mod && e.key === "k") {
        e.preventDefault();
        toggleCommandPalette();
      }
      // Cmd+R → reload/refresh the app
      if (mod && e.key === "r" && !e.shiftKey) {
        e.preventDefault();
        window.location.reload();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleSidebar, toggleCommandPalette]);

  // ── Resolve the active project ────────────────────────────────────────────
  const activeProject = projects.find((p) => p.path === activeProjectPath);

  return (
    <div
      className="flex flex-col w-full h-full overflow-hidden"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      <TitleBar />

      <ErrorBoundary>
        <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
          {/* Hide sidebar when no project is active (welcome screen) */}
          {activeProject !== undefined && !sidebarCollapsed && <Sidebar />}
          {activeProject !== undefined && !sidebarCollapsed && (
            <ResizeDivider orientation="vertical" onDrag={handleSidebarDrag} />
          )}

          <main className="flex-1 min-h-0 min-w-0 overflow-hidden relative">
            {/* Keep ALL booted projects mounted so terminals stay alive.
                Only the active project is visible. */}
            {projects
              .filter((p) => bootedProjects.has(p.path))
              .map((p) => (
                <div
                  key={p.path}
                  className="absolute inset-0"
                  style={{
                    visibility:
                      p.path === activeProjectPath ? "visible" : "hidden",
                    pointerEvents:
                      p.path === activeProjectPath ? "auto" : "none",
                    zIndex: p.path === activeProjectPath ? 1 : 0,
                  }}
                >
                  <ProjectView
                    projectPath={p.path}
                    isActive={p.path === activeProjectPath}
                  />
                </div>
              ))}
            {/* Boot new project if not yet booted */}
            {activeProject !== undefined &&
              !bootedProjects.has(activeProject.path) && (
                <div className="absolute inset-0" style={{ zIndex: 1 }}>
                  <ProjectView projectPath={activeProject.path} isActive />
                </div>
              )}
            {activeProject === undefined && <NoProjectState />}
          </main>
        </div>
      </ErrorBoundary>

      <StatusBar
        projectCount={
          projects.filter((p) =>
            useTabStore.getState().bootedProjects.has(p.path),
          ).length
        }
        isActive={activeProject !== undefined}
      />

      <CommandPalette />
      <SettingsPanel />
      <OnboardingOverlay />
    </div>
  );
};

// ─── Welcome state — recent projects ──────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

interface RecentSession {
  sessionId: string;
  model?: string;
  lastActiveAt: number;
}

interface ProjectWithSessions {
  project: Project;
  recentSessions: RecentSession[];
}

const NoProjectState: React.FC = () => {
  const claude = useClaudeAPI();
  const { projects, setActiveProject, addProject } = useProjectStore();
  const [projectsWithSessions, setProjectsWithSessions] = useState<
    ProjectWithSessions[]
  >([]);

  useEffect(() => {
    const load = async () => {
      try {
        const sessions = await claude.scanSessions();
        const sorted = projects
          .slice()
          .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
          .slice(0, 8);

        const result: ProjectWithSessions[] = sorted.map((project) => {
          const projSessions = sessions
            .filter((s) => s.cwd === project.path)
            .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
            .slice(0, 3)
            .map((s) => ({
              sessionId: s.sessionId,
              model: s.model,
              lastActiveAt: s.lastActiveAt,
            }));
          return { project, recentSessions: projSessions };
        });

        setProjectsWithSessions(result);
      } catch {
        const sorted = projects
          .slice()
          .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
          .slice(0, 8);
        setProjectsWithSessions(
          sorted.map((p) => ({ project: p, recentSessions: [] })),
        );
      }
    };
    void load();
  }, [claude, projects]);

  const handleOpenFolder = useCallback(async () => {
    try {
      const folderPath = await claude.openFolderDialog();
      if (folderPath) {
        addProject(makeProject(folderPath));
        setActiveProject(folderPath);
      }
    } catch (err) {
      console.warn("[Welcome] openFolderDialog failed:", err);
    }
  }, [claude, addProject, setActiveProject]);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
      <div className="text-center">
        <h2
          className="text-lg font-semibold mb-1"
          style={{
            fontFamily: "'Geist', system-ui, sans-serif",
            color: "var(--text-secondary)",
          }}
        >
          Welcome
        </h2>
        <p
          className="text-xs"
          style={{
            fontFamily: "'Geist Mono', monospace",
            color: "var(--text-dim)",
          }}
        >
          Select a recent project or press Cmd+K
        </p>
      </div>

      {projectsWithSessions.length > 0 && (
        <div className="w-full max-w-sm flex flex-col gap-0">
          <span
            className="text-[10px] uppercase tracking-widest font-medium px-3 mb-1"
            style={{
              fontFamily: "'Geist', system-ui, sans-serif",
              color: "var(--text-dim)",
            }}
          >
            Recent Projects
          </span>
          {projectsWithSessions.map(({ project }) => (
            <button
              key={project.path}
              type="button"
              onClick={() => setActiveProject(project.path)}
              className="w-full flex items-center gap-3 px-3 py-2 text-left
                transition-colors cursor-pointer group"
              style={{ borderRadius: 4 }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor =
                  "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor =
                  "transparent";
              }}
            >
              <span
                className="text-sm truncate flex-1 min-w-0"
                style={{
                  fontFamily: "'Geist', system-ui, sans-serif",
                  color: "var(--text-secondary)",
                }}
              >
                {project.name}
              </span>
              <span
                className="text-[10px] truncate max-w-[180px]"
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  color: "var(--text-dim)",
                }}
                title={project.path}
              >
                {project.shortPath}
              </span>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={handleOpenFolder}
        className="flex items-center gap-2 px-4 py-2 rounded-md text-sm
          transition-colors cursor-pointer"
        style={{
          fontFamily: "'Geist', system-ui, sans-serif",
          backgroundColor: "rgba(var(--accent-primary), 0.1)",
          color: "var(--accent-primary)",
          border: "1px solid var(--border)",
        }}
      >
        Open Folder
      </button>
    </div>
  );
};

export default App;
