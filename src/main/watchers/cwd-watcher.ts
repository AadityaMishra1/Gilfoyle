import path from 'path'
import chokidar, { FSWatcher } from 'chokidar'

/**
 * Watches an active session's working directory for file-system changes.
 *
 * Emits 'add' | 'change' | 'unlink' events with paths relative to the watched
 * cwd so the renderer can display them without leaking absolute host paths.
 *
 * Ignored paths: node_modules, .git, dist, out, and dot-files/folders.
 */
export class CwdWatcher {
  private watcher: FSWatcher | null = null

  /**
   * Start watching `cwd` recursively.
   * If a watcher is already running it is stopped first.
   *
   * @param cwd - Absolute path to the directory to watch.
   * @param onChange - Callback invoked with the event kind and the path of the
   *   changed file relative to `cwd`.
   */
  start(cwd: string, onChange: (event: string, filePath: string) => void): void {
    this.stop()

    this.watcher = chokidar.watch('.', {
      cwd,
      persistent: true,
      ignoreInitial: true,
      // Ignore common large / irrelevant directories and hidden files.
      ignored: [
        /(^|[/\\])\../,            // dot-files and dot-directories
        /node_modules/,
        /[/\\]\.git([/\\]|$)/,
        /[/\\]dist([/\\]|$)/,
        /[/\\]out([/\\]|$)/,
      ],
      awaitWriteFinish: {
        stabilityThreshold: 150,
        pollInterval: 100,
      },
    })

    this.watcher.on('add', (relativePath: string) => {
      onChange('add', normalizeSep(relativePath))
    })

    this.watcher.on('change', (relativePath: string) => {
      onChange('change', normalizeSep(relativePath))
    })

    this.watcher.on('unlink', (relativePath: string) => {
      onChange('unlink', normalizeSep(relativePath))
    })

    this.watcher.on('error', (err: unknown) => {
      console.error('[CwdWatcher] watcher error:', err)
    })
  }

  /**
   * Stop and release the underlying chokidar watcher.
   * Safe to call when no watcher is running.
   */
  stop(): void {
    if (this.watcher !== null) {
      this.watcher.close().catch((err: unknown) => {
        console.warn('[CwdWatcher] error closing watcher:', err)
      })
      this.watcher = null
    }
  }

  /**
   * Switch to a new working directory without requiring the caller to manage
   * the watcher lifecycle explicitly.
   *
   * @param newCwd - Absolute path of the new directory to watch.
   * @param onChange - Callback for subsequent file-change events.
   */
  changeCwd(newCwd: string, onChange: (event: string, filePath: string) => void): void {
    this.stop()
    this.start(newCwd, onChange)
  }
}

/** Normalise Windows back-slashes to forward-slashes for consistency. */
function normalizeSep(filePath: string): string {
  return filePath.split(path.sep).join('/')
}
