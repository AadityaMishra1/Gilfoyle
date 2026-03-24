import { create } from 'zustand'
import type { UsageStats } from '../../main/services/usage-tracker'

interface UsageStore {
  messagesUsed: number
  estimatedLimit: number
  percentUsed: number
  rateStatus: 'healthy' | 'moderate' | 'high' | 'rate_limited'
  /** Milliseconds until estimated daily reset. */
  resetEstimate: number
  /** Unix timestamp (ms) of last stats refresh. */
  lastUpdated: number

  setUsageStats: (stats: UsageStats) => void
}

export const useUsageStore = create<UsageStore>((set) => ({
  messagesUsed: 0,
  estimatedLimit: 500,
  percentUsed: 0,
  rateStatus: 'healthy',
  resetEstimate: 0,
  lastUpdated: 0,

  setUsageStats: (stats) =>
    set({
      messagesUsed: stats.messagesUsed,
      estimatedLimit: stats.estimatedLimit,
      percentUsed: stats.percentUsed,
      rateStatus: stats.rateStatus,
      resetEstimate: stats.resetEstimate,
      lastUpdated: Date.now(),
    }),
}))
