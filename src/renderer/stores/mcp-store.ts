/**
 * Zustand store for MCP (Model Context Protocol) server status data.
 *
 * Populated by the renderer after invoking the MCP status IPC channel on
 * startup and after each polling interval. Components subscribe selectively
 * via selector functions to avoid unnecessary re-renders.
 */

import { create } from 'zustand'
import type { MCPServerStatus } from '../../shared/types/mcp'

interface MCPStore {
  /** Status snapshot for every configured MCP server. */
  servers: MCPServerStatus[]

  /** Replace the entire servers list (e.g. on initial load or full refresh). */
  setServers: (servers: MCPServerStatus[]) => void

  /**
   * Merge a partial status update into an existing server entry.
   * If no server with the given name exists the update is ignored.
   */
  updateServer: (name: string, updates: Partial<MCPServerStatus>) => void
}

export const useMCPStore = create<MCPStore>()((set) => ({
  servers: [],

  setServers: (servers) => set({ servers }),

  updateServer: (name, updates) =>
    set((state) => ({
      servers: state.servers.map((s) =>
        s.name === name ? { ...s, ...updates } : s,
      ),
    })),
}))
