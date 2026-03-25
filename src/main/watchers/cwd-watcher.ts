import path from "path";
import chokidar, { FSWatcher } from "chokidar";

/**
 * Watches the working directory for file-system changes.
 *
 * Singleton watcher — only one directory at a time. When switching to a
 * DIFFERENT directory, the old watcher is stopped and a new one created.
 * When switching BACK to the same directory, the existing watcher is reused
 * (avoids 6+ second chokidar re-initialization on large projects).
 *
 * Emits 'add' | 'change' | 'unlink' events with paths relative to the watched
 * cwd so the renderer can display them without leaking absolute host paths.
 *
 * Ignored paths: node_modules, .git, dist, out, and dot-files/folders.
 */
export class CwdWatcher {
  private watcher: FSWatcher | null = null;
  private currentCwd: string | null = null;
  /** Mutable ref so chokidar listeners always call the latest callback. */
  private onChangeRef: ((event: string, filePath: string) => void) | null =
    null;

  /**
   * Start watching `cwd` recursively.
   * If already watching the same CWD, just update the callback (instant).
   * If switching to a different CWD, close old watcher and create new one.
   */
  start(
    cwd: string,
    onChange: (event: string, filePath: string) => void,
  ): void {
    // Same CWD and watcher is alive — just update the callback, skip rescan.
    if (cwd === this.currentCwd && this.watcher !== null) {
      this.onChangeRef = onChange;
      return;
    }

    // Different CWD — stop old watcher, create new one.
    this.stop();
    this.currentCwd = cwd;
    this.onChangeRef = onChange;

    const watcher = chokidar.watch(".", {
      cwd,
      persistent: true,
      ignoreInitial: true,
      ignored: [
        /(^|[/\\])\../, // dot-files and dot-directories
        /node_modules/,
        /[/\\]\.git([/\\]|$)/,
        /[/\\]dist([/\\]|$)/,
        /[/\\]out([/\\]|$)/,
      ],
      awaitWriteFinish: {
        stabilityThreshold: 150,
        pollInterval: 100,
      },
    });

    // All listeners delegate to onChangeRef so the callback can be updated
    // without recreating the watcher.
    watcher.on("add", (relativePath: string) => {
      this.onChangeRef?.("add", normalizeSep(relativePath));
    });

    watcher.on("addDir", (relativePath: string) => {
      if (relativePath === "." || relativePath === "") return;
      this.onChangeRef?.("addDir", normalizeSep(relativePath));
    });

    watcher.on("change", (relativePath: string) => {
      this.onChangeRef?.("change", normalizeSep(relativePath));
    });

    watcher.on("unlink", (relativePath: string) => {
      this.onChangeRef?.("unlink", normalizeSep(relativePath));
    });

    watcher.on("unlinkDir", (relativePath: string) => {
      this.onChangeRef?.("unlinkDir", normalizeSep(relativePath));
    });

    watcher.on("error", (err: unknown) => {
      console.error("[CwdWatcher] watcher error:", err);
    });

    this.watcher = watcher;
  }

  /** Close the watcher and release resources. */
  stop(): void {
    if (this.watcher) {
      this.watcher.close().catch((err: unknown) => {
        console.warn("[CwdWatcher] error closing watcher:", err);
      });
      this.watcher = null;
      this.currentCwd = null;
      this.onChangeRef = null;
    }
  }

  /** Stop the current watcher and start a new one for `newCwd`. */
  changeCwd(
    newCwd: string,
    onChange: (event: string, filePath: string) => void,
  ): void {
    this.stop();
    this.start(newCwd, onChange);
  }
}

/** Normalise Windows back-slashes to forward-slashes for consistency. */
function normalizeSep(filePath: string): string {
  return filePath.split(path.sep).join("/");
}
