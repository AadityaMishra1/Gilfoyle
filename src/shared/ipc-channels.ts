// IPC channel name constants — single source of truth for main, preload, and renderer
export const IPC_CHANNELS = {
  SESSION_CREATE: "session:create",
  SESSION_SEND_INPUT: "session:send-input",
  SESSION_RESIZE: "session:resize",
  SESSION_KILL: "session:kill",
  SESSION_LIST: "session:list",
  PTY_DATA: "pty:data",
  PTY_EXIT: "pty:exit",
  STREAM_EVENT: "stream:event",
  APP_GET_PLATFORM: "app:get-platform",
  APP_GET_HOME_DIR: "app:get-home-dir",
  // Session scanning and watching
  SCAN_SESSIONS: "sessions:scan",
  WATCH_SESSIONS_START: "sessions:watch-start",
  SESSION_UPDATED: "sessions:updated",
  // Analytics
  GET_ANALYTICS: "analytics:get",
  GET_TODAY_COST: "analytics:today-cost",
  ANALYTICS_UPDATED: "analytics:updated",
  // MCP status
  GET_MCP_STATUS: "mcp:get-status",
  // CWD watching
  WATCH_CWD: "cwd:watch",
  CWD_FILE_CHANGED: "cwd:file-changed",
  // Activity feed
  GET_ACTIVITIES: "activities:get",
  ACTIVITY_NEW: "activities:new",
  // Usage tracking
  GET_USAGE: "usage:get",
  USAGE_UPDATED: "usage:updated",
  // Project scanning
  GET_PROJECTS: "projects:get",
  // Native folder picker
  OPEN_FOLDER_DIALOG: "dialog:open-folder",
  // File scanning
  SCAN_DIR: "files:scan-dir",
  READ_FILE: "files:read-file",
  // Real usage from claude CLI (captured from PTY output)
  GET_CLAUDE_USAGE: "usage:get-claude",
  // Request /usage be sent to active PTY
  REQUEST_USAGE: "usage:request",
  // OAuth-based usage (real subscription percentages)
  GET_OAUTH_USAGE: "usage:get-oauth",
  // Git status for a project directory
  GIT_STATUS: "git:status",
  // Git diff for a file
  GIT_DIFF: "git:diff",
  // Write file content to disk
  WRITE_FILE: "files:write-file",
  // Plugin discovery (GitHub + bundled registry)
  DISCOVER_PLUGINS: "plugins:discover",
  // Installed extensions (reads ~/.claude/plugins/installed_plugins.json + settings.json)
  GET_INSTALLED_EXTENSIONS: "extensions:get-installed",
  // Run a plugin install command in a shell (not PTY) and return success/failure
  PLUGIN_INSTALL: "plugins:install",
  // Get recent sessions for a SPECIFIC project path (lightweight, no full scan)
  GET_PROJECT_SESSIONS: "sessions:get-project",
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

// ─── Session management ────────────────────────────────────────────────────

export interface SessionCreateOptions {
  cwd?: string;
  sessionId?: string;
  name?: string;
  cols?: number;
  rows?: number;
  /** If set, spawn `claude --resume <id>` instead of a bare shell */
  resumeSessionId?: string;
  /** If true, spawn `claude --continue` to resume the most recent session */
  continueSession?: boolean;
}

export interface SessionMetadata {
  sessionId: string;
  name: string;
  cwd: string;
  cols: number;
  rows: number;
  createdAt: number;
  pid: number;
}

export interface SessionListEntry {
  sessionId: string;
  name: string;
  cwd: string;
  cols: number;
  rows: number;
  createdAt: number;
  pid: number;
}

// ─── PTY push events ──────────────────────────────────────────────────────

export interface PtyDataPayload {
  sessionId: string;
  data: string;
}

export interface PtyExitPayload {
  sessionId: string;
  exitCode: number;
  signal?: number;
}

// ─── Project scanning ─────────────────────────────────────────────────────

/** Represents a unique project path discovered in ~/.claude/projects/. */
export interface ProjectInfo {
  /** Absolute filesystem path of the project working directory. */
  path: string;
  /** Final path segment used as the display name. */
  name: string;
  /** Number of JSONL session files found for this project. */
  sessionCount: number;
  /** Unix timestamp (ms) of the most recently active session in this project. */
  lastActiveAt: number;
}

// ─── IPC invoke signatures ────────────────────────────────────────────────

/**
 * Typed map of invoke channel → [args, return value].
 * Used to keep preload and renderer in sync without duplication.
 */
export interface IpcInvokeMap {
  [IPC_CHANNELS.SESSION_CREATE]: [
    opts: SessionCreateOptions,
    result: SessionMetadata,
  ];
  [IPC_CHANNELS.SESSION_SEND_INPUT]: [
    sessionId: string,
    data: string,
    result: void,
  ];
  [IPC_CHANNELS.SESSION_RESIZE]: [
    sessionId: string,
    cols: number,
    rows: number,
    result: void,
  ];
  [IPC_CHANNELS.SESSION_KILL]: [sessionId: string, result: void];
  [IPC_CHANNELS.SESSION_LIST]: [result: SessionListEntry[]];
  // NodeJS.Platform is only available when @types/node is in scope (main/preload).
  // For the renderer we use a plain string union that is equivalent.
  [IPC_CHANNELS.APP_GET_PLATFORM]: [result: string];
  [IPC_CHANNELS.APP_GET_HOME_DIR]: [result: string];
}
