import path from "path";
import chokidar, { FSWatcher } from "chokidar";

export interface ClaudeDirWatcherCallbacks {
  onSessionCreated: (sessionId: string, filePath: string) => void;
  onSessionUpdated: (sessionId: string, filePath: string) => void;
  onSessionDeleted: (sessionId: string) => void;
}

/**
 * Watches `~/.claude/projects/` for JSONL session file additions, changes,
 * and deletions using chokidar.
 *
 * The sessionId is the filename without the `.jsonl` extension, matching how
 * Claude Code CLI names its per-session transcript files.
 */
export class ClaudeDirWatcher {
  private watchPath: string;
  private watcher: FSWatcher | null = null;

  constructor(homeDir: string) {
    this.watchPath = path.join(homeDir, ".claude", "projects");
  }

  /**
   * Start watching for JSONL session files.
   * Safe to call multiple times — previous watcher is stopped first.
   */
  start(callbacks: ClaudeDirWatcherCallbacks): void {
    // Clean up any existing watcher before starting a new one.
    if (this.watcher !== null) {
      this.stop();
    }

    this.watcher = chokidar.watch("**/*.jsonl", {
      cwd: this.watchPath,
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: false,
      // Use raw change events without stability delay — the JsonlParser
      // handles partial lines gracefully via byte-offset tracking.
      usePolling: false,
      // Avoid watching node_modules or other irrelevant directories if they
      // somehow appear under the projects path.
      ignored: /(^|[/\\])\../,
      depth: 2,
    });

    this.watcher.on("add", (relativePath: string) => {
      const sessionId = this.extractSessionId(relativePath);
      if (sessionId === null) return;
      const fullPath = path.join(this.watchPath, relativePath);
      callbacks.onSessionCreated(sessionId, fullPath);
    });

    this.watcher.on("change", (relativePath: string) => {
      const sessionId = this.extractSessionId(relativePath);
      if (sessionId === null) return;
      const fullPath = path.join(this.watchPath, relativePath);
      callbacks.onSessionUpdated(sessionId, fullPath);
    });

    this.watcher.on("unlink", (relativePath: string) => {
      const sessionId = this.extractSessionId(relativePath);
      if (sessionId === null) return;
      callbacks.onSessionDeleted(sessionId);
    });

    this.watcher.on("error", (err: unknown) => {
      console.error("[ClaudeDirWatcher] watcher error:", err);
    });
  }

  /**
   * Stop the underlying chokidar watcher and release resources.
   */
  stop(): void {
    if (this.watcher !== null) {
      this.watcher.close().catch((err: unknown) => {
        console.warn("[ClaudeDirWatcher] error closing watcher:", err);
      });
      this.watcher = null;
    }
  }

  /**
   * Extract the sessionId from a relative JSONL path.
   * Path format: `{encoded-cwd}/{session-id}.jsonl`
   * Returns null when the path does not match the expected structure.
   */
  private extractSessionId(relativePath: string): string | null {
    const basename = path.basename(relativePath);
    if (!basename.endsWith(".jsonl")) return null;
    const sessionId = basename.slice(0, -".jsonl".length);
    if (sessionId.length === 0) return null;
    return sessionId;
  }
}
