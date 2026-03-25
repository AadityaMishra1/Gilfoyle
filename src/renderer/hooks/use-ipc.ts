import type {
  SessionCreateOptions,
  SessionMetadata,
  SessionListEntry,
  PtyDataPayload,
  PtyExitPayload,
  ProjectInfo,
} from "../../shared/ipc-channels";
import type { SessionMeta } from "../../shared/types/session";
import type { SessionCostSummary } from "../../shared/types/analytics";
import type { MCPServerStatus } from "../../shared/types/mcp";

/**
 * Typed interface for the Claude API exposed by the preload script
 * via contextBridge as window.claude.
 */
export interface ClaudeAPI {
  createSession(opts: SessionCreateOptions): Promise<SessionMetadata>;
  sendInput(sessionId: string, data: string): Promise<void>;
  resizeSession(sessionId: string, cols: number, rows: number): Promise<void>;
  killSession(sessionId: string): Promise<void>;
  getChildProcesses(sessionId: string): Promise<string[]>;
  listSessions(): Promise<SessionListEntry[]>;
  onPtyData(callback: (data: PtyDataPayload) => void): () => void;
  onPtyExit(callback: (data: PtyExitPayload) => void): () => void;
  getPlatform(): Promise<string>;
  getHomeDir(): Promise<string>;
  // Session scanning and watching
  scanSessions(): Promise<SessionMeta[]>;
  watchSessions(): Promise<void>;
  onSessionsUpdated(callback: (sessions: SessionMeta[]) => void): () => void;
  // Analytics
  getAnalytics(): Promise<SessionCostSummary[]>;
  getTodayCost(): Promise<number>;
  onAnalyticsUpdated(
    callback: (summaries: SessionCostSummary[]) => void,
  ): () => void;
  // MCP status
  getMcpStatus(): Promise<MCPServerStatus[]>;
  // CWD watching
  watchCwd(cwd: string): Promise<void>;
  onCwdFileChanged(
    callback: (payload: { event: string; filePath: string }) => void,
  ): () => void;
  // Menu events forwarded from the main process
  onMenuAction(
    channel:
      | "menu:new-session"
      | "menu:close-tab"
      | "menu:toggle-sidebar"
      | "menu:command-palette",
    callback: () => void,
  ): () => void;
  // Project scanning
  getProjects(): Promise<ProjectInfo[]>;
  // Native folder picker
  openFolderDialog(): Promise<string | null>;
  // Activity feed
  getActivities(): Promise<unknown[]>;
  onActivityNew(callback: (activity: unknown) => void): () => void;
  // Usage tracking
  getUsage(): Promise<unknown>;
  onUsageUpdated(callback: (stats: unknown) => void): () => void;
  // File scanning
  scanDir(
    dirPath: string,
    maxDepth?: number,
  ): Promise<
    Array<{
      path: string;
      name: string;
      isDirectory: boolean;
      children?: unknown[];
    }>
  >;
  readFile(filePath: string): Promise<string | null>;
  // Real usage from PTY capture
  getClaudeUsage(): Promise<{
    bars: Array<{
      label: string;
      percentUsed: number;
      resetTime: string;
    }>;
    capturedAt: number;
  } | null>;
  // Send /usage to active PTY
  requestUsage(): Promise<{ sent: boolean; sessionId: string | null }>;
  // OAuth-based usage (real subscription percentages + reset times)
  getOAuthUsage(): Promise<{
    fiveHour: number;
    sevenDay: number;
    fiveHourResetsAt: string | null;
    sevenDayResetsAt: string | null;
    capturedAt: number;
  } | null>;
  // Write file content to disk
  writeFile(filePath: string, content: string): Promise<boolean>;
  // Git diff for a specific file
  getGitDiff(
    cwd: string,
    file: string,
    commitHash?: string,
  ): Promise<{ before: string; after: string; filePath: string } | null>;
  // Git status for a project directory
  getGitStatus(cwd: string): Promise<{
    branch: string;
    commits: Array<{ hash: string; message: string; timestamp: number }>;
    changes: Array<{ status: string; file: string }>;
  } | null>;
}

/**
 * Returns the typed window.claude API injected by the Electron preload script.
 * Throws a clear error in development if the preload has not exposed the API —
 * surfaces misconfiguration early rather than producing cryptic undefined errors.
 */
export function useClaudeAPI(): ClaudeAPI {
  const api = (window as Window & { claude?: ClaudeAPI }).claude;
  if (!api) {
    throw new Error(
      "[useClaudeAPI] window.claude is not defined. " +
        "Ensure the Electron preload script exposes the claude API via contextBridge.",
    );
  }
  return api;
}
