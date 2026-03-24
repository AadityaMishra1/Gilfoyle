import { create } from "zustand";
import type { SessionMeta } from "../../shared/types/session";

interface SessionStore {
  sessions: SessionMeta[];
  activeSessionId: string | null;
  // ─── Project grouping ─────────────────────────────────────────────────
  /** Maps an absolute project path to the PTY session IDs running inside it. */
  sessionsByProject: Map<string, string[]>;
  setSessions: (sessions: SessionMeta[]) => void;
  addSession: (session: SessionMeta) => void;
  updateSession: (sessionId: string, updates: Partial<SessionMeta>) => void;
  removeSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string | null) => void;
  // ─── Project grouping helpers ─────────────────────────────────────────
  addSessionToProject: (projectPath: string, sessionId: string) => void;
  removeSessionFromProject: (projectPath: string, sessionId: string) => void;
  getProjectSessions: (projectPath: string) => string[];
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  sessionsByProject: new Map<string, string[]>(),

  setSessions: (sessions) => set({ sessions }),

  addSession: (session) =>
    set((state) => {
      // Avoid duplicates — if a session with the same id already exists,
      // treat this as an update instead.
      const exists = state.sessions.some(
        (s) => s.sessionId === session.sessionId,
      );
      if (exists) {
        return {
          sessions: state.sessions.map((s) =>
            s.sessionId === session.sessionId ? { ...s, ...session } : s,
          ),
        };
      }
      return { sessions: [session, ...state.sessions] };
    }),

  updateSession: (sessionId, updates) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.sessionId === sessionId ? { ...s, ...updates } : s,
      ),
    })),

  removeSession: (sessionId) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.sessionId !== sessionId),
      // Clear active if the removed session was selected.
      activeSessionId:
        state.activeSessionId === sessionId ? null : state.activeSessionId,
    })),

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

  // ─── Project grouping ─────────────────────────────────────────────────

  addSessionToProject: (projectPath, sessionId) =>
    set((state) => {
      const next = new Map(state.sessionsByProject);
      const existing = next.get(projectPath) ?? [];
      if (!existing.includes(sessionId)) {
        next.set(projectPath, [...existing, sessionId]);
      }
      return { sessionsByProject: next };
    }),

  removeSessionFromProject: (projectPath, sessionId) =>
    set((state) => {
      const next = new Map(state.sessionsByProject);
      const existing = next.get(projectPath) ?? [];
      const filtered = existing.filter((id) => id !== sessionId);
      if (filtered.length === 0) {
        next.delete(projectPath);
      } else {
        next.set(projectPath, filtered);
      }
      return { sessionsByProject: next };
    }),

  getProjectSessions: (projectPath) => {
    return get().sessionsByProject.get(projectPath) ?? [];
  },
}));
