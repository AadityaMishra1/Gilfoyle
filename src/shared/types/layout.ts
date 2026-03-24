/**
 * Layout types for the react-mosaic-component panel system.
 * Panels are identified by `PanelId` and configured via `PANEL_CONFIGS`.
 */

/** Union of all valid panel identifiers in the mosaic layout. */
export type PanelId =
  | 'terminal'
  | 'sessions'
  | 'analytics'
  | 'files'
  | 'swarm'
  | 'mcp'
  | 'context'

/**
 * Static display and sizing configuration for a single panel.
 * Stored in `PANEL_CONFIGS` and consumed by the layout engine and
 * the panel picker UI.
 */
export interface PanelConfig {
  id: PanelId
  title: string
  /** Lucide icon name used to render the panel's tab icon. */
  icon: string
  /** Whether this panel appears in the default layout for new users. */
  defaultVisible: boolean
  /** Minimum width in pixels enforced by the mosaic layout engine. */
  minWidth?: number
  /** Minimum height in pixels enforced by the mosaic layout engine. */
  minHeight?: number
}

/**
 * Static configuration record for all panels.
 * Use this as the single source of truth when building the panel picker
 * or restoring a saved layout.
 */
export const PANEL_CONFIGS: Record<PanelId, PanelConfig> = {
  terminal: {
    id: 'terminal',
    title: 'Terminal',
    icon: 'terminal',
    defaultVisible: true,
  },
  sessions: {
    id: 'sessions',
    title: 'Sessions',
    icon: 'list',
    defaultVisible: true,
  },
  analytics: {
    id: 'analytics',
    title: 'Analytics',
    icon: 'bar-chart-2',
    defaultVisible: true,
  },
  files: {
    id: 'files',
    title: 'Files',
    icon: 'folder-tree',
    defaultVisible: false,
  },
  swarm: {
    id: 'swarm',
    title: 'Agents',
    icon: 'network',
    defaultVisible: false,
  },
  mcp: {
    id: 'mcp',
    title: 'MCP',
    icon: 'plug',
    defaultVisible: false,
  },
  context: {
    id: 'context',
    title: 'Context',
    icon: 'gauge',
    defaultVisible: false,
  },
}

/**
 * Named layout presets available from the layout picker.
 * - `beginner` — minimal layout with terminal and sessions only.
 * - `power` — all panels visible.
 * - `custom` — user-defined layout, persisted to disk.
 */
export type LayoutPreset = 'beginner' | 'power' | 'custom'
