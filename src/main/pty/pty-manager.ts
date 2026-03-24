// Use require() for node-pty — its native .node addon cannot be bundled by Vite/Rollup.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pty: typeof import("node-pty") = require("node-pty");
import { randomUUID } from "crypto";
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

    // If resuming a Claude session, spawn `claude --resume <id>` or `claude --continue`
    let command = shell;
    let args: string[] = [];
    if (opts.resumeSessionId) {
      command = "claude";
      args = ["--resume", opts.resumeSessionId];
    } else if (opts.continueSession) {
      command = "claude";
      args = ["--continue"];
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
          "/opt/homebrew/bin",
          "/usr/local/bin",
          `${home}/.cargo/bin`,
          `${home}/.local/bin`,
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
    };

    ptyProcess.onData((data: string) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        const payload: PtyDataPayload = { sessionId, data };
        this.mainWindow.webContents.send(IPC_CHANNELS.PTY_DATA, payload);
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
    session.process.kill();
    this.sessions.delete(sessionId);
  }

  listActive(): SessionListEntry[] {
    return Array.from(this.sessions.values()).map(this.toListEntry);
  }

  destroyAll(): void {
    for (const session of this.sessions.values()) {
      session.process.kill();
    }
    this.sessions.clear();
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
