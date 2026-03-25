// Use require() for node-pty — its native .node addon cannot be bundled by Vite/Rollup.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pty: typeof import("node-pty") = require("node-pty");
import { randomUUID } from "crypto";
import { execFileSync } from "child_process";
import { BrowserWindow } from "electron";
import { IPC_CHANNELS } from "../../shared/ipc-channels";
import type {
  SessionCreateOptions,
  SessionMetadata,
  SessionListEntry,
  PtyDataPayload,
  PtyExitPayload,
} from "../../shared/ipc-channels";

interface PtySession {
  sessionId: string;
  name: string;
  cwd: string;
  cols: number;
  rows: number;
  createdAt: number;
  pid: number;
  process: pty.IPty;
  /** True if this session spawned claude directly (resume/continue), not a shell */
  isDirect: boolean;
}

// ─── Usage data types (shared with renderer) ────────────────────────────────

export interface ClaudeUsageBar {
  label: string;
  percentUsed: number;
  resetTime: string;
}

export interface ClaudeUsageData {
  bars: ClaudeUsageBar[];
  capturedAt: number;
}

// ─── ANSI stripping ─────────────────────────────────────────────────────────

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str
    .replace(/\x1B\[[0-9;]*[A-Za-z]/g, "")
    .replace(/\x1B\][^\x07]*\x07/g, "")
    .replace(/\x1B[()][A-Za-z0-9]/g, "");
}

function parseUsageFromOutput(raw: string): ClaudeUsageBar[] {
  const clean = stripAnsi(raw);
  const bars: ClaudeUsageBar[] = [];
  const lines = clean
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let currentLabel = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (
      line.startsWith("Current session") ||
      line.startsWith("Current week") ||
      line.startsWith("Current day") ||
      line.startsWith("Extra usage")
    ) {
      currentLabel = line;
      continue;
    }

    const pctMatch = line.match(/(\d+)%\s*used/);
    if (pctMatch && currentLabel) {
      const percentUsed = parseInt(pctMatch[1]!, 10);
      let resetTime = "";

      // Search nearby lines for reset info
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        if (lines[j]!.includes("Resets") || lines[j]!.includes("Reset")) {
          resetTime = lines[j]!.trim();
          break;
        }
      }
      if (!resetTime) {
        for (let j = Math.max(0, i - 2); j <= i; j++) {
          const m = lines[j]!.match(/(Resets?\s.+)/);
          if (m) {
            resetTime = m[1]!;
            break;
          }
        }
      }

      bars.push({ label: currentLabel, percentUsed, resetTime });
      currentLabel = "";
    }
  }

  return bars;
}

// ─── PTY Manager ────────────────────────────────────────────────────────────

export class PtyManager {
  private sessions: Map<string, PtySession> = new Map();
  private mainWindow: BrowserWindow | null = null;

  // Usage detection: buffer recent PTY output per session to detect /usage output
  private outputBuffers: Map<string, string> = new Map();
  private usageDetectTimers: Map<string, ReturnType<typeof setTimeout>> =
    new Map();

  // Last captured usage data (shared across sessions)
  private lastUsageData: ClaudeUsageData | null = null;

  // Scrollback buffer: stores recent PTY output per session so terminals
  // can recover content after being hidden during project switches.
  private scrollbackBuffers: Map<string, string[]> = new Map();
  private static readonly MAX_SCROLLBACK_CHUNKS = 2000;

  // External listeners for session exit events
  private exitListeners: Array<(sessionId: string) => void> = [];

  /** Register a callback that fires when any PTY session exits. */
  onSessionExit(cb: (sessionId: string) => void): void {
    this.exitListeners.push(cb);
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  getLastUsageData(): ClaudeUsageData | null {
    return this.lastUsageData;
  }

  /**
   * Get the scrollback buffer for a session. Used to restore terminal content
   * after a project switch hid the terminal temporarily.
   */
  getScrollback(sessionId: string): string {
    const buf = this.scrollbackBuffers.get(sessionId);
    if (!buf || buf.length === 0) return "";
    return buf.join("");
  }

  /**
   * Send /usage to an active session's PTY.
   * Returns the sessionId used, or null if no sessions are available.
   */
  requestUsage(): string | null {
    // Find a running session to send /usage to
    for (const [id, session] of this.sessions) {
      try {
        session.process.write("/usage\n");
        return id;
      } catch {
        continue;
      }
    }
    return null;
  }

  create(opts: SessionCreateOptions = {}): SessionMetadata {
    const sessionId = opts.sessionId ?? randomUUID();
    const shell =
      process.platform === "win32"
        ? (process.env.COMSPEC ?? "powershell.exe")
        : (process.env.SHELL ?? "/bin/sh");
    const cwd = opts.cwd ?? process.env.HOME ?? "/";
    const cols = opts.cols ?? 120;
    const rows = opts.rows ?? 30;
    const name = opts.name ?? `Session ${this.sessions.size + 1}`;

    // If resuming a Claude session, spawn through a login shell so claude
    // gets the full user environment (.zshrc, .zprofile, etc.). Without this,
    // `claude --continue` can fail on large projects because it misses env
    // vars that are only set in the shell profile. `exec` replaces the shell
    // with claude so the PTY connects directly to it.
    let command = shell;
    let args: string[] = [];
    let isDirect = false;
    if (opts.resumeSessionId) {
      command = shell;
      args = ["-l", "-c", `exec claude --resume ${opts.resumeSessionId}`];
      isDirect = true;
    } else if (opts.continueSession) {
      command = shell;
      args = ["-l", "-c", "exec claude --continue"];
      isDirect = true;
    }

    // Build a PATH that includes common install locations for tools like
    // starship, eza, and other modern CLI utilities.
    const isWin = process.platform === "win32";
    const pathSep = isWin ? ";" : ":";
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    const extraPaths = isWin
      ? [
          `${home}\\AppData\\Roaming\\npm`,
          `${home}\\.cargo\\bin`,
          `${home}\\.local\\bin`,
        ]
      : [
          // Homebrew on Apple Silicon and Intel Macs
          "/opt/homebrew/bin",
          "/usr/local/bin",
          // Common Linux paths
          "/usr/bin",
          "/snap/bin",
          "/home/linuxbrew/.linuxbrew/bin",
          // User-local paths
          `${home}/.cargo/bin`,
          `${home}/.local/bin`,
          `${home}/.nvm/versions/node/current/bin`,
        ];
    const enhancedPath = [...extraPaths, process.env.PATH ?? ""].join(pathSep);

    const ptyProcess = pty.spawn(command, args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        TERM_PROGRAM: "Gilfoyle",
        npm_config_prefix: "",
        // Enable starship prompt if installed (auto-detected by shell rc)
        STARSHIP_CONFIG: process.env.STARSHIP_CONFIG ?? "",
        // Tell eza/exa to use colors and icons by default
        EZA_COLORS: process.env.EZA_COLORS ?? "",
        // Ensure claude + modern CLI tools are on PATH
        PATH: enhancedPath,
      } as Record<string, string>,
    });

    const session: PtySession = {
      sessionId,
      name,
      cwd,
      cols,
      rows,
      createdAt: Date.now(),
      pid: ptyProcess.pid,
      process: ptyProcess,
      isDirect: !!(opts.resumeSessionId || opts.continueSession),
    };

    ptyProcess.onData((data: string) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        const payload: PtyDataPayload = { sessionId, data };
        this.mainWindow.webContents.send(IPC_CHANNELS.PTY_DATA, payload);
      }

      // Store in scrollback buffer for terminal recovery after project switch.
      let buf = this.scrollbackBuffers.get(sessionId);
      if (!buf) {
        buf = [];
        this.scrollbackBuffers.set(sessionId, buf);
      }
      buf.push(data);
      // Cap to prevent unbounded memory growth.
      if (buf.length > PtyManager.MAX_SCROLLBACK_CHUNKS) {
        buf.splice(0, buf.length - PtyManager.MAX_SCROLLBACK_CHUNKS);
      }

      // ── Usage detection ──────────────────────────────────────────────
      this.detectUsageInOutput(sessionId, data);
    });

    ptyProcess.onExit(
      ({ exitCode, signal }: { exitCode: number; signal?: number }) => {
        const payload: PtyExitPayload = { sessionId, exitCode, signal };
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send(IPC_CHANNELS.PTY_EXIT, payload);
        }
        this.sessions.delete(sessionId);
        this.outputBuffers.delete(sessionId);
        this.scrollbackBuffers.delete(sessionId);
        const timer = this.usageDetectTimers.get(sessionId);
        if (timer) {
          clearTimeout(timer);
          this.usageDetectTimers.delete(sessionId);
        }
        // Notify external listeners
        for (const cb of this.exitListeners) {
          try {
            cb(sessionId);
          } catch {
            /* ignore */
          }
        }
      },
    );

    this.sessions.set(sessionId, session);

    return this.toMetadata(session);
  }

  /**
   * Watch PTY output for /usage command results.
   * Buffers recent output and parses when we see "% used" patterns.
   */
  private detectUsageInOutput(sessionId: string, data: string): void {
    // Append to rolling buffer (keep last 8KB per session)
    const existing = this.outputBuffers.get(sessionId) ?? "";
    const updated = (existing + data).slice(-8192);
    this.outputBuffers.set(sessionId, updated);

    // Check if output contains usage patterns
    const clean = stripAnsi(updated);
    if (!clean.includes("% used")) return;

    // Debounce: wait for full output (multiple bars arrive over several frames)
    const existingTimer = this.usageDetectTimers.get(sessionId);
    if (existingTimer) clearTimeout(existingTimer);

    this.usageDetectTimers.set(
      sessionId,
      setTimeout(() => {
        this.usageDetectTimers.delete(sessionId);

        const buf = this.outputBuffers.get(sessionId) ?? "";
        const bars = parseUsageFromOutput(buf);
        if (bars.length === 0) return;

        this.lastUsageData = { bars, capturedAt: Date.now() };

        // Push to renderer
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send(
            IPC_CHANNELS.USAGE_UPDATED,
            this.lastUsageData,
          );
        }

        // Clear the buffer so we don't re-parse stale data
        this.outputBuffers.set(sessionId, "");
      }, 1500),
    );
  }

  write(sessionId: string, data: string): void {
    const session = this.requireSession(sessionId);
    session.process.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.requireSession(sessionId);
    session.cols = cols;
    session.rows = rows;
    session.process.resize(cols, rows);
  }

  kill(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.killProcessTree(session);
  }

  /**
   * Get the names of child processes running under the PTY shell.
   * Returns an array of process command names (e.g. ["claude"], ["vim"]).
   * Returns empty array if the shell is idle (no child processes).
   */
  getChildProcesses(sessionId: string): string[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    // For direct claude sessions (resume/continue), the PTY root IS claude.
    // Always report as running so user gets a confirmation.
    if (session.isDirect) return ["claude"];

    if (process.platform === "win32") {
      // On Windows we can't easily inspect child processes.
      // Return a generic marker so the renderer shows a confirmation.
      return ["unknown"];
    }

    try {
      // pgrep -P <pid> lists direct child PIDs of the shell process.
      const output = execFileSync("pgrep", ["-P", String(session.pid)], {
        encoding: "utf8",
        timeout: 2000,
      }).trim();

      if (!output) return [];

      const childPids = output.split("\n").filter(Boolean);
      const processes: string[] = [];
      for (const childPid of childPids) {
        try {
          const comm = execFileSync("ps", ["-p", childPid, "-o", "comm="], {
            encoding: "utf8",
            timeout: 2000,
          }).trim();

          if (comm) {
            // Strip path prefix (e.g. /usr/bin/vim -> vim)
            processes.push(comm.split("/").pop() ?? comm);
          }
        } catch {
          continue;
        }
      }
      return processes;
    } catch {
      // pgrep returns exit code 1 when no children found — that's expected
      return [];
    }
  }

  listActive(): SessionListEntry[] {
    return Array.from(this.sessions.values()).map(this.toListEntry);
  }

  destroyAll(): void {
    for (const session of this.sessions.values()) {
      this.killProcessTree(session);
    }
    // Sessions are cleaned up by onExit handlers, but clear the map as a safety net
    // in case onExit doesn't fire (e.g. during app quit).
    this.sessions.clear();
  }

  /**
   * Kill a PTY session and its entire process tree (including child processes
   * like `claude`).
   *
   * Signal escalation strategy:
   * 1. SIGINT  — Claude CLI handles this like Ctrl+C: gracefully aborts in-flight
   *              API requests, cancels the current turn, and cleans up.
   * 2. SIGTERM — After 1.5s if still alive, send SIGTERM for a harder shutdown.
   * 3. SIGKILL — After another 1.5s if still alive, force-kill.
   */
  private killProcessTree(session: PtySession): void {
    const pid = session.pid;

    const isAlive = (): boolean => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };

    const sendSignalToGroup = (signal: NodeJS.Signals): void => {
      if (process.platform !== "win32") {
        try {
          process.kill(-pid, signal);
        } catch {
          // Process group may already be dead — ignore ESRCH.
        }
      }
    };

    // Step 1: Send SIGINT to the process group (graceful Claude shutdown).
    // This is equivalent to the user pressing Ctrl+C in the terminal.
    sendSignalToGroup("SIGINT");

    // Step 2: After 1.5s, escalate to SIGTERM if still alive.
    const termTimer = setTimeout(() => {
      if (!isAlive()) return;
      sendSignalToGroup("SIGTERM");
      try {
        session.process.kill();
      } catch {
        // Already dead — ignore.
      }
    }, 1500);

    // Step 3: After 3s total, force-kill with SIGKILL if still alive.
    const killTimer = setTimeout(() => {
      if (!isAlive()) return;
      sendSignalToGroup("SIGKILL");
      try {
        session.process.kill("SIGKILL");
      } catch {
        // Already dead — ignore.
      }
    }, 3000);

    // Don't let these timers keep the Node.js event loop alive during app quit.
    for (const timer of [termTimer, killTimer]) {
      if (timer && typeof timer === "object" && "unref" in timer) {
        timer.unref();
      }
    }
  }

  private requireSession(sessionId: string): PtySession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`PTY session not found: ${sessionId}`);
    }
    return session;
  }

  private toMetadata(session: PtySession): SessionMetadata {
    return {
      sessionId: session.sessionId,
      name: session.name,
      cwd: session.cwd,
      cols: session.cols,
      rows: session.rows,
      createdAt: session.createdAt,
      pid: session.pid,
    };
  }

  private toListEntry(session: PtySession): SessionListEntry {
    return {
      sessionId: session.sessionId,
      name: session.name,
      cwd: session.cwd,
      cols: session.cols,
      rows: session.rows,
      createdAt: session.createdAt,
      pid: session.pid,
    };
  }
}
