import path from "path";
import chokidar, { FSWatcher } from "chokidar";

/**
 * Watches the working directory for file-system changes.
 *
 * Emits 'add' | 'change' | 'unlink' events with paths relative to the watched
 * cwd so the renderer can display them without leaking absolute host paths.
 *
 * Ignored paths: node_modules, .git, dist, out, and dot-files/folders.
 */
export class CwdWatcher {
  private watcher: FSWatcher | null = null;

  /**
   * Start watching `cwd` recursively.
   * Closes any existing watcher first.
   */
  start(
    cwd: string,
    onChange: (event: string, filePath: string) => void,
  ): void {
    this.stop();

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

    watcher.on("add", (relativePath: string) => {
      onChange("add", normalizeSep(relativePath));
    });

    watcher.on("addDir", (relativePath: string) => {
      if (relativePath === "." || relativePath === "") return;
      onChange("addDir", normalizeSep(relativePath));
    });

    watcher.on("change", (relativePath: string) => {
      onChange("change", normalizeSep(relativePath));
    });

    watcher.on("unlink", (relativePath: string) => {
      onChange("unlink", normalizeSep(relativePath));
    });

    watcher.on("unlinkDir", (relativePath: string) => {
      onChange("unlinkDir", normalizeSep(relativePath));
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
