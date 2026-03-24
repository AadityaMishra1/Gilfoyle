/**
 * Model Context Protocol (MCP) server configuration and status types.
 * MCP servers extend Claude Code with additional tools accessible during
 * a session.
 */

/**
 * Configuration for a single MCP server entry.
 * Matches the shape used in Claude Code's `settings.json` `mcpServers` map.
 */
export interface MCPServerConfig {
  /** Human-readable identifier for this server. */
  name: string
  /** The executable to launch (for stdio transport). */
  command: string
  /** Command-line arguments passed to `command`. */
  args?: string[]
  /** Environment variables injected into the server process. */
  env?: Record<string, string>
  /** Server URL for SSE/HTTP transport. Mutually exclusive with `command`. */
  url?: string
}

/**
 * Runtime status of an MCP server as reported by the Claude Code CLI.
 * Polled periodically and surfaced in the MCP panel.
 */
export interface MCPServerStatus {
  name: string
  status: 'connected' | 'disconnected' | 'needs-auth' | 'error'
  /** Number of tools exposed by this server when connected. */
  toolCount: number
  /** Unix timestamp (ms) of the last status check. */
  lastChecked: number
  /** Human-readable error message present when `status` is "error". */
  error?: string
}

/**
 * A single tool exposed by an MCP server and available during a session.
 */
export interface MCPTool {
  /** The tool's registered name as declared by the server. */
  name: string
  /** The `MCPServerConfig.name` of the server that provides this tool. */
  server: string
  description?: string
}
