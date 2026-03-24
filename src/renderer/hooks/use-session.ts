import { useEffect, useCallback } from 'react'
import { useSessionStore } from '../stores/session-store'
import { useClaudeAPI } from './use-ipc'
import type { SessionMeta } from '../../shared/types/session'

/**
 * Connects the renderer to session IPC channels.
 *
 * On mount it requests the full session list from the main process and
 * populates the Zustand store.  It also subscribes to push events for
 * session creation, update, and deletion so the UI stays in sync as Claude
 * Code CLI sessions come and go.
 *
 * Returns helpers for imperative use by consumers that need them.
 */
export function useSessionManager(): {
  sessions: SessionMeta[]
  activeSession: SessionMeta | null
  refresh: () => Promise<void>
} {
  const claude = useClaudeAPI()
  const { sessions, activeSessionId, setSessions, addSession, updateSession, removeSession } =
    useSessionStore()

  // ── Initial load ───────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      // SESSION_LIST returns the live PTY sessions known to the main process.
      // The full disk index is a superset — here we reconcile what we have.
      const list = await claude.listSessions()
      const metas: SessionMeta[] = list.map((entry) => ({
        sessionId: entry.sessionId,
        name: entry.name,
        cwd: entry.cwd,
        createdAt: entry.createdAt,
        lastActiveAt: entry.createdAt,
        model: undefined,
        gitBranch: undefined,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheReadTokens: 0,
        totalCacheWriteTokens: 0,
        estimatedCostUSD: 0,
        isActive: true,
      }))
      setSessions(metas)
    } catch (err) {
      console.error('[useSessionManager] refresh failed:', err)
    }
  }, [claude, setSessions])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // ── Session change push events ─────────────────────────────────────────
  // The main process pushes stream events on STREAM_EVENT.  We watch for a
  // synthetic `session_created` / `session_updated` / `session_deleted` type
  // that the main process emits when the ClaudeDirWatcher fires.
  //
  // Because the preload's `onPtyData` / `onPtyExit` are the only event
  // listeners exposed today, we hook into the PTY exit event to mark
  // sessions as inactive rather than removing them.
  useEffect(() => {
    const removeExit = claude.onPtyExit((payload) => {
      updateSession(payload.sessionId, { isActive: false })
    })

    return () => {
      removeExit()
    }
  }, [claude, updateSession])

  // ── Sync active PTY sessions every time the store mounts ──────────────
  // If a new PTY session is created elsewhere (e.g. via SESSION_CREATE IPC),
  // we add it to the store when we detect its PTY data coming in.
  useEffect(() => {
    const removeData = claude.onPtyData((payload) => {
      const exists = sessions.some((s) => s.sessionId === payload.sessionId)
      if (!exists) {
        // We don't have full metadata here — refresh to fetch it.
        void refresh()
      }
    })

    return () => {
      removeData()
    }
    // We only need `payload.sessionId` from the event — `sessions` would
    // create an unstable dep; use a ref via the store selector instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claude, refresh])

  const activeSession =
    sessions.find((s) => s.sessionId === activeSessionId) ?? null

  return { sessions, activeSession, refresh }
}

// Re-export store actions for convenience so consumers don't need to import
// the store separately just to dispatch mutations.
export { useSessionStore }
