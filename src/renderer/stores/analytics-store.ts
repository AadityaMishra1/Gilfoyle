/**
 * Zustand store for token and cost analytics data.
 *
 * Data flows in from the main process via IPC (analytics updates pushed on
 * each assistant message). The renderer writes to this store; React components
 * subscribe selectively to avoid unnecessary re-renders.
 */

import { create } from 'zustand'
import type { SessionCostSummary, DailyCostRollup } from '../../shared/types/analytics'

interface AnalyticsStore {
  /** Summaries for all known sessions, sorted newest-first. */
  sessionSummaries: SessionCostSummary[]

  /** Daily cost rollups for the chart — typically last 30 days. */
  dailyRollups: DailyCostRollup[]

  /** Accumulated cost for the current calendar day (USD). */
  todayCost: number

  /**
   * Budget threshold in USD. When todayCost exceeds this value the UI
   * surfaces a warning. Defaults to $10.
   */
  budgetThreshold: number

  // ── Updaters ──────────────────────────────────────────────────────────────

  /** Replace the entire session summaries list (e.g. on initial load). */
  setSessionSummaries: (summaries: SessionCostSummary[]) => void

  /**
   * Upsert a single session summary. Replaces an existing entry with the
   * same sessionId, or appends it if new. List is re-sorted by lastUpdateTime
   * descending after each update.
   */
  updateSessionSummary: (summary: SessionCostSummary) => void

  /** Replace the daily rollups list (e.g. on initial load or date-range change). */
  setDailyRollups: (rollups: DailyCostRollup[]) => void

  /** Update today's accumulated cost figure. */
  setTodayCost: (cost: number) => void

  /** Update the budget threshold (persisted separately by the settings UI). */
  setBudgetThreshold: (threshold: number) => void
}

export const useAnalyticsStore = create<AnalyticsStore>()((set) => ({
  sessionSummaries: [],
  dailyRollups: [],
  todayCost: 0,
  budgetThreshold: 10,

  setSessionSummaries: (summaries) =>
    set({
      sessionSummaries: [...summaries].sort(
        (a, b) => b.lastUpdateTime - a.lastUpdateTime,
      ),
    }),

  updateSessionSummary: (summary) =>
    set((state) => {
      const existing = state.sessionSummaries.findIndex(
        (s) => s.sessionId === summary.sessionId,
      )
      const updated =
        existing >= 0
          ? state.sessionSummaries.map((s, i) => (i === existing ? summary : s))
          : [...state.sessionSummaries, summary]

      return {
        sessionSummaries: updated.sort(
          (a, b) => b.lastUpdateTime - a.lastUpdateTime,
        ),
      }
    }),

  setDailyRollups: (rollups) =>
    set({
      dailyRollups: [...rollups].sort((a, b) => a.date.localeCompare(b.date)),
    }),

  setTodayCost: (cost) => set({ todayCost: cost }),

  setBudgetThreshold: (threshold) => set({ budgetThreshold: threshold }),
}))
