import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Project {
  path: string;
  name: string;
  shortPath: string;
  sessionCount: number;
  lastActiveAt: number;
}

interface ProjectStore {
  projects: Project[];
  activeProjectPath: string | null;
  setProjects: (projects: Project[]) => void;
  setActiveProject: (path: string | null) => void;
  addProject: (project: Project) => void;
  removeProject: (path: string) => void;
}

function toShortPath(absPath: string): string {
  return absPath.replace(/^\/Users\/[^/]+/, "~");
}

export function makeProject(absPath: string, sessionCount = 0): Project {
  const segments = absPath.replace(/\/$/, "").split("/");
  const name = segments[segments.length - 1] ?? absPath;
  return {
    path: absPath,
    name,
    shortPath: toShortPath(absPath),
    sessionCount,
    lastActiveAt: Date.now(),
  };
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      projects: [],
      activeProjectPath: null,

      setProjects: (projects) => set({ projects }),

      setActiveProject: (path) => set({ activeProjectPath: path }),

      addProject: (project) =>
        set((state) => {
          const exists = state.projects.some((p) => p.path === project.path);
          if (exists) {
            return {
              projects: state.projects.map((p) =>
                p.path === project.path ? { ...p, ...project } : p,
              ),
            };
          }
          return { projects: [project, ...state.projects] };
        }),

      removeProject: (path) =>
        set((state) => {
          const next = state.projects.filter((p) => p.path !== path);
          const newActive =
            state.activeProjectPath === path
              ? (next[0]?.path ?? null)
              : state.activeProjectPath;
          return { projects: next, activeProjectPath: newActive };
        }),
    }),
    {
      name: "gilfoyle:projects",
      // Don't persist activeProjectPath — each launch shows the welcome
      // screen with recent projects. Only persist the project list itself.
      partialize: (state) => ({
        projects: state.projects,
      }),
    },
  ),
);
