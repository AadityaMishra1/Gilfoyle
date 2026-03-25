import { contextBridge, ipcRenderer, webUtils } from "electron";
import { IPC_CHANNELS } from "../shared/ipc-channels";
import type {
  SessionCreateOptions,
  SessionMetadata,
  SessionListEntry,
  PtyDataPayload,
  PtyExitPayload,
  ProjectInfo,
} from "../shared/ipc-channels";
import type { SessionMeta } from "../shared/types/session";
import type { SessionCostSummary } from "../shared/types/analytics";
import type { MCPServerStatus } from "../shared/types/mcp";
import type { ActivityEvent } from "../shared/types/activity";
import type { UsageStats } from "../main/services/usage-tracker";

// ─── Typed API surface ────────────────────────────────────────────────────

const api = {
  // Session management
  createSession: (opts: SessionCreateOptions = {}): Promise<SessionMetadata> =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_CREATE, opts),

  sendInput: (sessionId: string, data: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_SEND_INPUT, sessionId, data),

  resizeSession: (
    sessionId: string,
    cols: number,
    rows: number,
  ): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_RESIZE, sessionId, cols, rows),

  killSession: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_KILL, sessionId),

  getChildProcesses: (sessionId: string): Promise<string[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET_CHILD_PROCESSES, sessionId),

  listSessions: (): Promise<SessionListEntry[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_LIST),

  // Push-event listeners.
  // Each returns an unsubscribe function so callers can clean up in effects.
  onPtyData: (callback: (payload: PtyDataPayload) => void): (() => void) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      payload: PtyDataPayload,
    ): void => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.PTY_DATA, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PTY_DATA, handler);
  },

  onPtyExit: (callback: (payload: PtyExitPayload) => void): (() => void) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      payload: PtyExitPayload,
    ): void => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.PTY_EXIT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PTY_EXIT, handler);
  },

  // Menu events forwarded from the main process
  onMenuAction: (
    channel:
      | "menu:new-session"
      | "menu:close-tab"
      | "menu:toggle-sidebar"
      | "menu:command-palette",
    callback: () => void,
  ): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  // App information
  getPlatform: (): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_GET_PLATFORM),

  getHomeDir: (): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_GET_HOME_DIR),

  // Session scanning and watching
  scanSessions: (): Promise<SessionMeta[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.SCAN_SESSIONS),

  watchSessions: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.WATCH_SESSIONS_START),

  onSessionsUpdated: (
    callback: (sessions: SessionMeta[]) => void,
  ): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: SessionMeta[]): void =>
      callback(data);
    ipcRenderer.on(IPC_CHANNELS.SESSION_UPDATED, handler);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.SESSION_UPDATED, handler);
  },

  // Analytics
  getAnalytics: (): Promise<SessionCostSummary[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_ANALYTICS),

  getTodayCost: (): Promise<number> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_TODAY_COST),

  onAnalyticsUpdated: (
    callback: (summaries: SessionCostSummary[]) => void,
  ): (() => void) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      data: SessionCostSummary[],
    ): void => callback(data);
    ipcRenderer.on(IPC_CHANNELS.ANALYTICS_UPDATED, handler);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.ANALYTICS_UPDATED, handler);
  },

  // MCP status
  getMcpStatus: (): Promise<MCPServerStatus[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_MCP_STATUS),

  // CWD watching
  watchCwd: (cwd: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.WATCH_CWD, cwd),

  onCwdFileChanged: (
    callback: (payload: { event: string; filePath: string }) => void,
  ): (() => void) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      data: { event: string; filePath: string },
    ): void => callback(data);
    ipcRenderer.on(IPC_CHANNELS.CWD_FILE_CHANGED, handler);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.CWD_FILE_CHANGED, handler);
  },

  // Activity feed
  getActivities: (): Promise<ActivityEvent[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_ACTIVITIES),

  onActivityNew: (
    callback: (activity: ActivityEvent) => void,
  ): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: ActivityEvent): void =>
      callback(data);
    ipcRenderer.on(IPC_CHANNELS.ACTIVITY_NEW, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ACTIVITY_NEW, handler);
  },

  // Usage tracking
  getUsage: (): Promise<UsageStats> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_USAGE),

  onUsageUpdated: (callback: (stats: UsageStats) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: UsageStats): void =>
      callback(data);
    ipcRenderer.on(IPC_CHANNELS.USAGE_UPDATED, handler);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.USAGE_UPDATED, handler);
  },

  // Project scanning
  getProjects: (): Promise<ProjectInfo[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PROJECTS),

  // Native folder picker
  openFolderDialog: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_FOLDER_DIALOG),

  // File scanning
  scanDir: (
    dirPath: string,
    maxDepth?: number,
  ): Promise<
    Array<{
      path: string;
      name: string;
      isDirectory: boolean;
      children?: unknown[];
    }>
  > => ipcRenderer.invoke(IPC_CHANNELS.SCAN_DIR, dirPath, maxDepth),

  readFile: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.READ_FILE, filePath),

  // Real usage from claude PTY output
  getClaudeUsage: (): Promise<{
    bars: Array<{
      label: string;
      percentUsed: number;
      resetTime: string;
    }>;
    capturedAt: number;
  } | null> => ipcRenderer.invoke(IPC_CHANNELS.GET_CLAUDE_USAGE),

  // Send /usage to active PTY session
  requestUsage: (): Promise<{ sent: boolean; sessionId: string | null }> =>
    ipcRenderer.invoke(IPC_CHANNELS.REQUEST_USAGE),

  // OAuth-based usage (real subscription percentages)
  getOAuthUsage: (): Promise<{
    fiveHour: number;
    sevenDay: number;
    fiveHourResetsAt: string | null;
    sevenDayResetsAt: string | null;
    capturedAt: number;
  } | null> => ipcRenderer.invoke(IPC_CHANNELS.GET_OAUTH_USAGE),

  // Write file content to disk
  writeFile: (filePath: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.WRITE_FILE, filePath, content),

  // Plugin discovery
  discoverPlugins: (): Promise<
    Array<{
      id: string;
      name: string;
      description: string;
      category: string;
      stars: number;
      repo: string;
      installCommand: string;
      tags: string[];
      essential: boolean;
      source: string;
    }>
  > => ipcRenderer.invoke(IPC_CHANNELS.DISCOVER_PLUGINS),

  // Installed extensions (reads ~/.claude/plugins/installed_plugins.json + settings.json)
  getInstalledExtensions: (): Promise<{
    plugins: Array<{
      key: string;
      name: string;
      marketplace: string;
      enabled: boolean;
      version: string;
      installedAt: string;
      lastUpdated: string;
    }>;
    hooks: Array<{ event: string; command: string }>;
    pluginNames: string[];
  }> => ipcRenderer.invoke(IPC_CHANNELS.GET_INSTALLED_EXTENSIONS),

  // Lightweight per-project session scan (fast — only reads one project dir)
  getProjectSessions: (
    projectPath: string,
  ): Promise<
    Array<{ sessionId: string; lastActiveAt: number; model?: string }>
  > => ipcRenderer.invoke(IPC_CHANNELS.GET_PROJECT_SESSIONS, projectPath),

  // Plugin install — runs command in a shell process, not PTY
  installPlugin: (
    installCommand: string,
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_INSTALL, installCommand),

  // Get Claude Code CLI version
  getClaudeVersion: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_CLAUDE_VERSION),

  // Stream events (agent tool_use, tool_result from JSONL watcher)
  onStreamEvent: (callback: (event: unknown) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: unknown): void =>
      callback(data);
    ipcRenderer.on(IPC_CHANNELS.STREAM_EVENT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.STREAM_EVENT, handler);
  },

  // Get buffered agent stream events (restoring agent list after project switch)
  getStreamEvents: (projectPath: string): Promise<unknown[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_STREAM_EVENTS, projectPath),

  // PTY scrollback replay (for restoring terminal after project switch)
  getPtyScrollback: (sessionId: string): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PTY_SCROLLBACK, sessionId),

  // File management
  createFile: (filePath: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_FILE, filePath),

  createDir: (dirPath: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_DIR, dirPath),

  renameFile: (
    oldPath: string,
    newPath: string,
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.RENAME_FILE, oldPath, newPath),

  trashFile: (filePath: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.TRASH_FILE, filePath),

  fileExists: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_EXISTS, filePath),

  revealInFinder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.REVEAL_IN_FINDER, filePath),

  // Get the real filesystem path for a File object from a drag event.
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  copyFilesInto: (
    sourcePaths: string[],
    destDir: string,
  ): Promise<Array<{ src: string; ok: boolean; error?: string }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.COPY_FILES_INTO, sourcePaths, destDir),

  // Git diff for a specific file
  getGitDiff: (
    cwd: string,
    file: string,
    commitHash?: string,
  ): Promise<{ before: string; after: string; filePath: string } | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.GIT_DIFF, cwd, file, commitHash),

  // Git status for a project directory
  getGitStatus: (
    cwd: string,
  ): Promise<{
    branch: string;
    commits: Array<{ hash: string; message: string; timestamp: number }>;
    changes: Array<{ status: string; file: string }>;
  } | null> => ipcRenderer.invoke(IPC_CHANNELS.GIT_STATUS, cwd),
} as const;

contextBridge.exposeInMainWorld("claude", api);

export type ClaudeApi = typeof api;
