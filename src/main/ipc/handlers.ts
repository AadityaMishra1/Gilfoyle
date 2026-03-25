import { ipcMain, BrowserWindow, dialog } from "electron";
import os from "os";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { execFileSync, execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
import { IPC_CHANNELS } from "../../shared/ipc-channels";
import type { SessionCreateOptions } from "../../shared/ipc-channels";
import type { PtyManager } from "../pty/pty-manager";
import { SessionIndex } from "../services/session-index";
import { CostAggregator } from "../services/cost-aggregator";
import { MCPStatusService } from "../services/mcp-status";
import { ClaudeDirWatcher } from "../watchers/claude-dir-watcher";
import { CwdWatcher } from "../watchers/cwd-watcher";
import { JsonlParser } from "../parsers/jsonl-parser";
import { classifyEvent } from "../parsers/stream-event-classifier";
import { parseToolUseToActivity } from "../services/activity-parser";
import {
  decodeProjectPath,
  encodeProjectPath,
} from "../../shared/utils/path-decoder";
import { InstalledPluginService } from "../services/installed-plugins";
import { UsageTracker } from "../services/usage-tracker";
import { OAuthUsageService } from "../services/oauth-usage";
import type { ActivityEvent } from "../../shared/types/activity";

/**
 * Decode an encoded CWD directory name back to an absolute path.
 * Format: `-Users-foo-Projects-bar` → `/Users/foo/Projects/bar`
 */
function decodeProjectDir(encoded: string): string {
  // The encoding replaces `/` with `-` and prepends `-`.
  // So `-Users-foo-bar` means `/Users/foo/bar`.
  if (encoded.startsWith("-")) {
    return "/" + encoded.slice(1).replace(/-/g, "/");
  }
  return encoded.replace(/-/g, "/");
}

/**
 * Extract the project path from a JSONL file path.
 * Path format: ~/.claude/projects/{encoded-cwd}/{sessionId}.jsonl
 */
function projectPathFromJsonl(filePath: string, projectsDir: string): string {
  const relative = path.relative(projectsDir, filePath);
  const firstSegment = relative.split(path.sep)[0] ?? "";
  return decodeProjectDir(firstSegment);
}

/**
 * Registers all ipcMain.handle() bindings.
 *
 * Call once after the BrowserWindow and PtyManager are ready. Safe to call
 * multiple times — existing handlers are removed first to avoid duplicate
 * registration during hot-reload in development.
 */
export function registerIpcHandlers(
  ptyManager: PtyManager,
  mainWindow: BrowserWindow,
  homeDir: string,
  oauthUsage: OAuthUsageService,
): void {
  // Attach the window reference so the PTY manager can push events.
  ptyManager.setMainWindow(mainWindow);

  // Remove any stale handlers from a previous registration (dev HMR).
  const channels = Object.values(IPC_CHANNELS);
  for (const channel of channels) {
    ipcMain.removeHandler(channel);
  }

  // ─── Service instances ─────────────────────────────────────────────────

  const sessionIndex = new SessionIndex();
  const dataDir = path.join(homeDir, ".gilfoyle");
  const costAggregator = new CostAggregator(dataDir);
  const mcpStatus = new MCPStatusService(homeDir);
  const claudeDirWatcher = new ClaudeDirWatcher(homeDir);
  const cwdWatcher = new CwdWatcher();
  const usageTracker = new UsageTracker(homeDir);

  // OAuthUsageService is a singleton passed from index.ts — NOT created here.
  // Re-wire the update callback to the current window and ensure polling runs.
  oauthUsage.setUpdateCallback((data) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.USAGE_UPDATED, {
        source: "oauth",
        oauth: data,
      });
    }
  });
  oauthUsage.startPolling();

  // Per-file JSONL parsers, keyed by absolute file path.
  const jsonlParsers = new Map<string, JsonlParser>();

  // In-memory activity ring buffer (max 500, FIFO).
  const MAX_ACTIVITIES = 500;
  const activityBuffer: ActivityEvent[] = [];

  // Load any previously persisted analytics state.
  costAggregator.load();

  // Scan sessions ONCE for both analytics and activity bootstrap.
  // DEFERRED: scanAll reads every JSONL file (~1GB for heavy users) and
  // blocks the main thread for 3-5+ seconds. We defer it so the window
  // can render and IPC handlers can process (session resume, git, etc.)
  // without waiting for the scan to finish.
  let bootstrapSessions: ReturnType<typeof sessionIndex.scanAll> = [];
  let bootstrapDone = false;

  setTimeout(() => {
    bootstrapSessions = sessionIndex.scanAll(homeDir);
    bootstrapDone = true;

    // Seed the scanAll cache so subsequent IPC calls are instant.
    scanAllCache = { data: bootstrapSessions, at: Date.now() };

    if (costAggregator.getAllSummaries().length === 0) {
      for (const session of bootstrapSessions) {
        const model = session.model ?? "";
        if (model.length === 0) continue;
        const totalTokens =
          session.totalInputTokens +
          session.totalOutputTokens +
          session.totalCacheReadTokens +
          session.totalCacheWriteTokens;
        if (totalTokens === 0) continue;
        costAggregator.seedFromSessionMeta(session);
      }
      if (
        bootstrapSessions.some(
          (s) => s.totalInputTokens + s.totalOutputTokens > 0,
        )
      ) {
        costAggregator.save();
      }
    }

    // ── Bootstrap activity from recent JSONL files ───────────────────────
    {
      const recentSessions = bootstrapSessions;
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      threeDaysAgo.setHours(0, 0, 0, 0);
      const cutoffMs = threeDaysAgo.getTime();

      for (const session of recentSessions.slice(0, 50)) {
        if (session.lastActiveAt < cutoffMs) continue;

        const projectsDir = path.join(homeDir, ".claude", "projects");
        const possibleDirs = (() => {
          try {
            return fs
              .readdirSync(projectsDir, { withFileTypes: true })
              .filter((d: { isDirectory: () => boolean }) => d.isDirectory())
              .map((d: { name: string }) => d.name);
          } catch {
            return [];
          }
        })();

        for (const dir of possibleDirs) {
          const jsonlPath = path.join(
            projectsDir,
            dir,
            `${session.sessionId}.jsonl`,
          );
          if (!fs.existsSync(jsonlPath)) continue;

          let fd: number | undefined;
          try {
            const stat = fs.statSync(jsonlPath);
            const tailBytes = Math.min(stat.size, 65536);
            fd = fs.openSync(jsonlPath, "r");
            const buf = Buffer.allocUnsafe(tailBytes);
            fs.readSync(
              fd,
              buf,
              0,
              tailBytes,
              Math.max(0, stat.size - tailBytes),
            );
            const text = buf.toString("utf8");
            const lines = text
              .split("\n")
              .filter((l: string) => l.trim().length > 0);

            for (const line of lines.slice(-50)) {
              try {
                const raw = JSON.parse(line);
                if (raw === null || typeof raw !== "object") continue;
                const event = classifyEvent(
                  raw as Record<string, unknown>,
                  session.sessionId,
                );
                if (event.type === "tool_use") {
                  const projectPath = decodeProjectPath(dir);
                  const activity = parseToolUseToActivity(
                    event,
                    session.sessionId,
                    projectPath,
                  );
                  if (activity !== null) activityBuffer.push(activity);
                }
              } catch {
                continue;
              }
            }
          } catch {
            /* skip unreadable */
          } finally {
            if (fd !== undefined) {
              try {
                fs.closeSync(fd);
              } catch {
                /* */
              }
            }
          }
          break;
        }
      }

      activityBuffer.sort((a, b) => b.timestamp - a.timestamp);
      if (activityBuffer.length > MAX_ACTIVITIES) {
        activityBuffer.splice(MAX_ACTIVITIES);
      }
    }

    // Push bootstrap data to renderer now that it's ready.
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(
        IPC_CHANNELS.SESSION_UPDATED,
        bootstrapSessions,
      );
      // Also push activities that were bootstrapped.
      for (const act of activityBuffer) {
        mainWindow.webContents.send(IPC_CHANNELS.ACTIVITY_NEW, act);
      }
    }
  }, 100); // 100ms — enough for window to render and IPC to register

  // ─── Session management ────────────────────────────────────────────────

  ipcMain.handle(
    IPC_CHANNELS.SESSION_CREATE,
    (_event, opts: SessionCreateOptions = {}) => {
      return ptyManager.create(opts);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SESSION_SEND_INPUT,
    (_event, sessionId: string, data: string) => {
      ptyManager.write(sessionId, data);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SESSION_RESIZE,
    (_event, sessionId: string, cols: number, rows: number) => {
      ptyManager.resize(sessionId, cols, rows);
    },
  );

  ipcMain.handle(IPC_CHANNELS.SESSION_KILL, (_event, sessionId: string) => {
    ptyManager.kill(sessionId);
  });

  ipcMain.handle(
    IPC_CHANNELS.SESSION_GET_CHILD_PROCESSES,
    (_event, sessionId: string) => {
      return ptyManager.getChildProcesses(sessionId);
    },
  );

  ipcMain.handle(IPC_CHANNELS.SESSION_LIST, () => {
    return ptyManager.listActive();
  });

  // ─── PTY scrollback replay ──────────────────────────────────────────────

  ipcMain.handle(
    IPC_CHANNELS.GET_PTY_SCROLLBACK,
    (_event, sessionId: string) => {
      return ptyManager.getScrollback(sessionId);
    },
  );

  // ─── App information ───────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.APP_GET_PLATFORM, () => {
    return process.platform;
  });

  ipcMain.handle(IPC_CHANNELS.APP_GET_HOME_DIR, () => {
    return os.homedir();
  });

  // ─── Claude CLI version ───────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.GET_CLAUDE_VERSION, () => {
    try {
      const version = execFileSync("claude", ["--version"], {
        encoding: "utf8",
        timeout: 5000,
      }).trim();
      return version || null;
    } catch {
      return null;
    }
  });

  // ─── Session scanning ──────────────────────────────────────────────────

  // scanAll reads every JSONL file synchronously and blocks the main thread
  // for 1-5+ seconds. Cache results so repeated calls (useDataLoader + App.tsx
  // NoProjectState effect) don't block twice.
  // Cache populated by deferred bootstrap scan (see setTimeout above).
  // Starts null — first IPC call before bootstrap completes returns empty.
  let scanAllCache: {
    data: ReturnType<typeof sessionIndex.scanAll>;
    at: number;
  } | null = null;

  ipcMain.handle(IPC_CHANNELS.SCAN_SESSIONS, () => {
    const now = Date.now();
    if (scanAllCache && now - scanAllCache.at < 15000) return scanAllCache.data;
    const data = sessionIndex.scanAll(homeDir);
    scanAllCache = { data, at: now };
    return data;
  });

  ipcMain.handle(IPC_CHANNELS.WATCH_SESSIONS_START, () => {
    startClaudeDirWatcher();
  });

  // Lightweight per-project session scan — only reads JSONL files for one project.
  // Two-pass approach: stat all files (cheap) to find the 10 most recent,
  // then read only those 10 for model detection (expensive). This avoids
  // reading hundreds of files in big projects.
  ipcMain.handle(
    IPC_CHANNELS.GET_PROJECT_SESSIONS,
    (_event, projectPath: string) => {
      try {
        const projectsDir = path.join(homeDir, ".claude", "projects");
        const encodedCwd = encodeProjectPath(projectPath);
        const projectDir = path.join(projectsDir, encodedCwd);

        if (!fs.existsSync(projectDir)) return [];

        const files = fs.readdirSync(projectDir);

        // Pass 1: stat only (cheap) — collect mtime for all JSONL files.
        const candidates: Array<{
          sessionId: string;
          fullPath: string;
          lastActiveAt: number;
        }> = [];

        for (const file of files) {
          if (!file.endsWith(".jsonl")) continue;
          try {
            const fullPath = path.join(projectDir, file);
            const mtime = fs.statSync(fullPath).mtimeMs;
            candidates.push({
              sessionId: file.slice(0, -".jsonl".length),
              fullPath,
              lastActiveAt: mtime,
            });
          } catch {
            // Skip unreadable files
          }
        }

        // Sort by most recent and take top 10 BEFORE doing expensive reads.
        candidates.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
        const top = candidates.slice(0, 10);

        // Pass 2: read last 4KB for model detection — only for the top 10.
        return top.map((c) => {
          let model: string | undefined;
          try {
            const stat = fs.statSync(c.fullPath);
            const fd = fs.openSync(c.fullPath, "r");
            const tailBuf = Buffer.allocUnsafe(4096);
            const offset = Math.max(0, stat.size - 4096);
            const bytesRead = fs.readSync(fd, tailBuf, 0, 4096, offset);
            fs.closeSync(fd);
            const tail = tailBuf.subarray(0, bytesRead).toString("utf8");
            const modelMatch = tail.match(/"model"\s*:\s*"([^"]+)"/);
            if (modelMatch) model = modelMatch[1];
          } catch {
            // Model detection is optional
          }
          return {
            sessionId: c.sessionId,
            lastActiveAt: c.lastActiveAt,
            model,
          };
        });
      } catch {
        return [];
      }
    },
  );

  // ─── Analytics ─────────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.GET_ANALYTICS, () => {
    return costAggregator.getAllSummaries();
  });

  ipcMain.handle(IPC_CHANNELS.GET_TODAY_COST, () => {
    return costAggregator.getTodayCost();
  });

  // ─── MCP status ────────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.GET_MCP_STATUS, () => {
    return mcpStatus.getServerStatuses();
  });

  // ─── Activity feed ─────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.GET_ACTIVITIES, () => {
    // Return a copy sorted newest-first.
    return [...activityBuffer].sort((a, b) => b.timestamp - a.timestamp);
  });

  // ─── Usage tracking ────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.GET_USAGE, () => {
    return usageTracker.getUsageStats();
  });

  // ─── Project scanning ──────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.GET_PROJECTS, () => {
    return sessionIndex.getProjectPaths(homeDir);
  });

  // ─── Native folder picker ──────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.OPEN_FOLDER_DIALOG, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
      title: "Open Project Folder",
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // ─── File scanning ─────────────────────────────────────────────────────

  ipcMain.handle(
    IPC_CHANNELS.SCAN_DIR,
    async (_event, dirPath: string, maxDepth = 3) => {
      return scanDirectoryAsync(dirPath, maxDepth);
    },
  );

  ipcMain.handle(IPC_CHANNELS.READ_FILE, async (_event, filePath: string) => {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > 512_000) return "[File too large to preview]";
      return fs.readFileSync(filePath, "utf8");
    } catch {
      return null;
    }
  });

  // ─── Real usage from PTY output capture ────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.GET_CLAUDE_USAGE, () => {
    // Return last captured usage data from any PTY session
    return ptyManager.getLastUsageData();
  });

  ipcMain.handle(IPC_CHANNELS.REQUEST_USAGE, () => {
    // Send /usage to an active PTY session — output will be captured
    // automatically by the PTY manager's usage detector
    const sessionId = ptyManager.requestUsage();
    return { sent: sessionId !== null, sessionId };
  });

  // ─── OAuth usage ──────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.GET_OAUTH_USAGE, async () => {
    return oauthUsage.getUsage();
  });

  // ─── Plugin discovery ──────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.DISCOVER_PLUGINS, async () => {
    try {
      const { discoverPlugins } = await import("../services/plugin-discovery");
      const registryData =
        await import("../../shared/data/plugin-registry.json");
      const bundled = (
        registryData.plugins as Array<Record<string, unknown>>
      ).map((p) => ({
        ...p,
        essential: (p.essential as boolean) ?? false,
        source: "bundled" as const,
      }));
      return await discoverPlugins(
        bundled as Parameters<typeof discoverPlugins>[0],
      );
    } catch {
      return [];
    }
  });

  // ─── Installed extensions ──────────────────────────────────────────

  const installedPluginService = new InstalledPluginService(homeDir);

  ipcMain.handle(IPC_CHANNELS.GET_INSTALLED_EXTENSIONS, () => {
    try {
      return installedPluginService.getInstalledExtensions();
    } catch {
      return { plugins: [], hooks: [], pluginNames: [] };
    }
  });

  // ─── Plugin install (runs command in a shell, not PTY) ─────────────────

  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_INSTALL,
    async (
      _event,
      installCommand: string,
    ): Promise<{ ok: boolean; error?: string; stdout?: string }> => {
      const { exec } =
        require("child_process") as typeof import("child_process");
      const { promisify } = require("util") as typeof import("util");
      const execAsync = promisify(exec);

      try {
        // Validate install command using a whitelist approach:
        // 1. Block shell injection characters universally
        // 2. Check command starts with an allowed base command
        // 3. Validate subcommand for each base command
        const cmd = installCommand.trim();

        // Step 1: Block shell metacharacters that enable injection
        // Allow $VARIABLE references (needed for e.g. $DATABASE_URL) but block $()
        if (
          /[;|`<>]|&&|\|\||[^$]\$\(|\$\(/.test(cmd.replace(/\$[A-Z_]+/g, ""))
        ) {
          return {
            ok: false,
            error: "Install command contains disallowed shell characters.",
          };
        }

        // Step 2 & 3: Check against allowed command patterns
        const ALLOWED_PATTERNS = [
          // npm install with any flags (-g, --save-dev, etc.) and scoped/unscoped packages
          /^npm\s+install(\s+-[a-zA-Z]+)*(\s+--[\w-]+(=[\w.-]+)?)*\s+(@[\w-]+\/)?[\w.-]+(@[\w.-]+)?(\s+--[\w-]+(=[\w.-]+)?)*$/,
          // npx with optional flags (-y, --yes, etc.) and scoped/unscoped packages, plus trailing args
          /^npx(\s+-[a-zA-Z]+)*(\s+--[\w-]+)?\s+(@[\w-]+\/)?[\w.-]+(@[\w.-]+)?(\s+[\w./@:$-]+)*$/,
          // claude plugin install
          /^claude\s+plugin\s+install\s+[\w@.-]+$/,
          // claude mcp add <name> -- <command> <args...>
          /^claude\s+mcp\s+add\s+[\w.-]+\s+--\s+npx(\s+-[a-zA-Z]+)*\s+(@[\w-]+\/)?[\w.-]+(@[\w.-]+)?(\s+[\w./@:$-]+)*$/,
          // pip install
          /^pip\s+install(\s+-[a-zA-Z]+)*\s+[\w.-]+(@[\w.-]+)?$/,
          // git clone (https URLs only)
          /^git\s+clone\s+https:\/\/[\w./-]+$/,
          // docker pull
          /^docker\s+pull\s+[\w./-]+(:\w+)?$/,
        ];

        if (!ALLOWED_PATTERNS.some((pattern) => pattern.test(cmd))) {
          return {
            ok: false,
            error:
              "Invalid install command. Allowed: npm install, npx, pip install, git clone, docker pull, claude plugin install, claude mcp add.",
          };
        }

        // Ensure common tool paths are available (Electron may strip PATH)
        const isWin = process.platform === "win32";
        const pathSep = isWin ? ";" : ":";
        const extraPaths = isWin
          ? [
              `${homeDir}\\AppData\\Roaming\\npm`,
              `${homeDir}\\.npm-global\\bin`,
            ]
          : [
              "/opt/homebrew/bin",
              "/usr/local/bin",
              `${homeDir}/.nvm/versions/node/$(node -v)/bin`,
              `${homeDir}/.npm-global/bin`,
            ];
        const envPath = [...extraPaths, process.env.PATH ?? ""].join(pathSep);

        // Use exec (not execFile) so the command is interpreted by the shell
        // including pipes, &&, etc. Login shell (-l) loads user's PATH.
        const shell =
          process.platform === "win32"
            ? (process.env.COMSPEC ?? "powershell.exe")
            : (process.env.SHELL ?? "/bin/zsh");
        const { stdout, stderr } = await execAsync(installCommand, {
          timeout: 120_000,
          env: { ...process.env, PATH: envPath },
          shell,
        });

        console.log("[PluginInstall] stdout:", stdout?.slice(0, 500));
        if (stderr)
          console.log("[PluginInstall] stderr:", stderr.slice(0, 500));

        // Re-read installed extensions so the renderer can update
        const ext = installedPluginService.getInstalledExtensions();
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send("extensions:updated", ext);
        }

        return { ok: true, stdout: stdout?.slice(0, 200) };
      } catch (err: unknown) {
        const e = err as { message?: string; stderr?: string; stdout?: string };
        const msg = e.stderr || e.message || String(err);
        console.warn("[PluginInstall] Failed:", msg);
        return { ok: false, error: msg.slice(0, 300) };
      }
    },
  );

  // ─── Git status ──────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.GIT_STATUS, async (_event, cwd: string) => {
    if (!cwd || !fs.existsSync(cwd)) return null;

    const opts = { cwd, timeout: 5000 };

    try {
      // Check if it's a git repo (async — doesn't block main process)
      try {
        await execFileAsync("git", ["rev-parse", "--git-dir"], opts);
      } catch {
        return null; // Not a git repo
      }

      let branch = "";
      try {
        const { stdout } = await execFileAsync(
          "git",
          ["rev-parse", "--abbrev-ref", "HEAD"],
          opts,
        );
        branch = stdout.trim();
      } catch {
        branch = "unknown";
      }

      let commits: Array<{
        hash: string;
        message: string;
        timestamp: number;
      }> = [];
      try {
        const { stdout: log } = await execFileAsync(
          "git",
          ["log", "--format=%H|%s|%at", "-15"],
          opts,
        );
        const trimmed = log.trim();
        if (trimmed.length > 0) {
          commits = trimmed.split("\n").map((line) => {
            const [hash = "", message = "", ts = "0"] = line.split("|");
            return {
              hash: hash.slice(0, 8),
              message,
              timestamp: parseInt(ts, 10) * 1000,
            };
          });
        }
      } catch {
        // No commits yet
      }

      let changes: Array<{
        status: string;
        file: string;
        additions?: number;
        deletions?: number;
      }> = [];
      try {
        const { stdout: status } = await execFileAsync(
          "git",
          ["status", "--porcelain"],
          opts,
        );
        const trimmed = status.trim();
        if (trimmed.length > 0) {
          changes = trimmed.split("\n").map((line) => ({
            status: line.slice(0, 2).trim(),
            file: line.slice(3),
          }));
        }
      } catch {
        // ignore
      }

      // Merge numstat for +/- line counts
      try {
        const { stdout: numstat } = await execFileAsync(
          "git",
          ["diff", "--numstat"],
          opts,
        );
        const trimmed = numstat.trim();
        if (trimmed.length > 0) {
          const statMap = new Map<string, { add: number; del: number }>();
          for (const line of trimmed.split("\n")) {
            const parts = line.split("\t");
            if (parts.length >= 3) {
              const add = parseInt(parts[0]!, 10);
              const del = parseInt(parts[1]!, 10);
              statMap.set(parts[2]!, {
                add: isNaN(add) ? 0 : add,
                del: isNaN(del) ? 0 : del,
              });
            }
          }
          for (const change of changes) {
            const stat = statMap.get(change.file);
            if (stat) {
              change.additions = stat.add;
              change.deletions = stat.del;
            }
          }
        }
      } catch {
        // numstat is optional
      }

      return { branch, commits, changes };
    } catch {
      return null;
    }
  });

  // ─── Git diff ───────────────────────────────────────────────────────────

  ipcMain.handle(
    IPC_CHANNELS.GIT_DIFF,
    async (_event, cwd: string, file: string, commitHash?: string) => {
      if (!cwd || !fs.existsSync(cwd)) return null;
      const opts = { cwd, timeout: 5000 };

      try {
        let before = "";
        let after = "";

        if (commitHash) {
          try {
            const r = await execFileAsync(
              "git",
              ["show", `${commitHash}^:${file}`],
              opts,
            );
            before = r.stdout;
          } catch {
            before = "";
          }
          try {
            const r = await execFileAsync(
              "git",
              ["show", `${commitHash}:${file}`],
              opts,
            );
            after = r.stdout;
          } catch {
            after = "";
          }
        } else {
          try {
            const r = await execFileAsync(
              "git",
              ["show", `HEAD:${file}`],
              opts,
            );
            before = r.stdout;
          } catch {
            before = "";
          }
          try {
            const resolvedPath = path.resolve(cwd, file);
            if (
              !resolvedPath.startsWith(path.resolve(cwd) + path.sep) &&
              resolvedPath !== path.resolve(cwd)
            ) {
              after = "";
            } else {
              after = await fsPromises.readFile(resolvedPath, "utf8");
            }
          } catch {
            after = "";
          }
        }

        return { before, after, filePath: file };
      } catch {
        return null;
      }
    },
  );

  // ─── Write file ─────────────────────────────────────────────────────────

  ipcMain.handle(
    IPC_CHANNELS.WRITE_FILE,
    (_event, filePath: string, content: string) => {
      try {
        // Atomic write: write to temp file then rename
        const tmpPath = filePath + ".tmp." + Date.now();
        fs.writeFileSync(tmpPath, content, "utf8");
        fs.renameSync(tmpPath, filePath);
        return true;
      } catch {
        return false;
      }
    },
  );

  // ─── File management ─────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.CREATE_FILE, (_event, filePath: string) => {
    try {
      // Create intermediate directories, then write an empty file.
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      // Only create if it doesn't already exist.
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, "", "utf8");
      }
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CREATE_DIR, (_event, dirPath: string) => {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.RENAME_FILE,
    (_event, oldPath: string, newPath: string) => {
      try {
        // Create destination parent directory if needed.
        const destDir = path.dirname(newPath);
        fs.mkdirSync(destDir, { recursive: true });
        fs.renameSync(oldPath, newPath);
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.TRASH_FILE, async (_event, filePath: string) => {
    try {
      const { shell } = await import("electron");
      await shell.trashItem(filePath);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FILE_EXISTS, (_event, filePath: string) => {
    return fs.existsSync(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.REVEAL_IN_FINDER, (_event, filePath: string) => {
    const { shell } = require("electron") as typeof import("electron");
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle(
    IPC_CHANNELS.COPY_FILES_INTO,
    (_event, sourcePaths: string[], destDir: string) => {
      const results: Array<{ src: string; ok: boolean; error?: string }> = [];
      for (const src of sourcePaths) {
        try {
          const baseName = path.basename(src);
          const dest = path.join(destDir, baseName);
          fs.cpSync(src, dest, { recursive: true });
          results.push({ src, ok: true });
        } catch (err) {
          results.push({
            src,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return results;
    },
  );

  // ─── CWD watching ──────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.WATCH_CWD, (_event, cwd: string) => {
    cwdWatcher.start(cwd, (event: string, filePath: string) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.CWD_FILE_CHANGED, {
          event,
          filePath,
        });
      }
    });
  });

  // ─── ClaudeDirWatcher startup ──────────────────────────────────────────

  // Track agent tool_use IDs so we only send relevant tool_results to renderer
  const agentToolUseIds = new Set<string>();

  // Synchronous version for bootstrap only
  function handleJsonlChangeSync(sessionId: string, filePath: string): void {
    if (!jsonlParsers.has(filePath)) {
      jsonlParsers.set(filePath, new JsonlParser(filePath));
    }
    const parser = jsonlParsers.get(filePath)!;
    const newLines = parser.readNewLines();
    processJsonlLines(newLines, sessionId, filePath);
  }

  // Async version for live watching — doesn't block main thread
  async function handleJsonlChange(
    sessionId: string,
    filePath: string,
  ): Promise<void> {
    if (!jsonlParsers.has(filePath)) {
      jsonlParsers.set(filePath, new JsonlParser(filePath));
    }
    const parser = jsonlParsers.get(filePath)!;
    const newLines = await parser.readNewLinesAsync();
    processJsonlLines(newLines, sessionId, filePath);
  }

  // ── Deferred expensive operations ─────────────────────────────────────────
  // sessionIndex.scanAll(), usageTracker.getUsageStats(), and
  // costAggregator.save() all do heavy synchronous I/O that blocks the main
  // thread for 100-500ms+. Instead of running them during active sessions
  // (which causes the beach ball), we SKIP them entirely while any PTY
  // session is running. They only execute when all sessions are idle or
  // when explicitly requested via IPC (e.g. user opens session list).
  //
  // The data they provide (session metadata, usage stats, cost totals) is
  // non-critical during active work — it's only needed for display in the
  // sidebar/usage panels, which can update once sessions finish.

  let deferredDirty = false;

  function scheduleSessionScan(): void {
    // Mark dirty — will be flushed when sessions go idle
    deferredDirty = true;
  }

  function scheduleCostSave(): void {
    deferredDirty = true;
  }

  function scheduleUsageUpdate(): void {
    deferredDirty = true;
  }

  // Flush deferred work when safe (no active PTY sessions or on a timer
  // when the app has been idle for 30s)
  function flushDeferredWork(): void {
    if (!deferredDirty) return;
    deferredDirty = false;

    setTimeout(() => {
      costAggregator.save();
      if (!mainWindow.isDestroyed()) {
        const sessions = sessionIndex.scanAll(homeDir);
        mainWindow.webContents.send(IPC_CHANNELS.SESSION_UPDATED, sessions);
        mainWindow.webContents.send(
          IPC_CHANNELS.USAGE_UPDATED,
          usageTracker.getUsageStats(),
        );
      }
    }, 0);
  }

  // Check every 60s — only flush if no active PTY sessions.
  // scanAll() inside flushDeferredWork blocks the main thread for 1-2s+,
  // so we keep this infrequent to avoid coinciding with user activity.
  setInterval(() => {
    if (deferredDirty && ptyManager.listActive().length === 0) {
      flushDeferredWork();
    }
  }, 60000);

  // Also flush when a PTY session exits (transition from active → idle).
  // 10s delay gives the user time to switch projects or open new sessions
  // before the expensive scanAll() blocks the main thread.
  ptyManager.onSessionExit(() => {
    setTimeout(() => {
      if (ptyManager.listActive().length === 0) {
        flushDeferredWork();
      }
    }, 10000);
  });

  const agentEventBuffers = new Map<string, unknown[]>();
  const MAX_AGENT_EVENTS = 200;

  ipcMain.handle(
    IPC_CHANNELS.GET_STREAM_EVENTS,
    (_event, projectPath: string) => {
      // Convert to encoded form for lookup (buffer is keyed by encoded dir name).
      const encoded = projectPath.replace(/\//g, "-");
      return [...(agentEventBuffers.get(encoded) ?? [])];
    },
  );

  function processJsonlLines(
    newLines: Array<{ raw: Record<string, unknown>; timestamp: number }>,
    sessionId: string,
    filePath: string,
  ): void {
    if (newLines.length === 0) return;
    let analyticsChanged = false;
    const newActivities: ActivityEvent[] = [];
    // Batch agent stream events — send as single IPC instead of one per event
    const agentStreamBatch: unknown[] = [];

    const projectsDir = path.join(homeDir, ".claude", "projects");
    const derivedProjectPath = projectPathFromJsonl(filePath, projectsDir);
    // Encoded dir name for buffer keying (decoded path is lossy for hyphenated names).
    const encodedProjectDir =
      path.relative(projectsDir, filePath).split(path.sep)[0] ?? "";

    for (const { raw } of newLines) {
      // Skip progress events early — they're ~80% of lines and contain
      // no useful data for the GUI. This is the main performance optimization.
      const rawType = raw["type"];
      if (rawType === "progress") continue;

      const event = classifyEvent(raw, sessionId);

      if (event.type === "assistant_message" && event.usage !== undefined) {
        const model =
          event.model ??
          (typeof raw["model"] === "string" ? (raw["model"] as string) : "");
        if (model.length > 0) {
          costAggregator.trackUsage(sessionId, model, event.usage);
          analyticsChanged = true;
        }
      }

      // Parse tool_use events into ActivityEvents.
      if (event.type === "tool_use") {
        const activity = parseToolUseToActivity(
          event,
          sessionId,
          derivedProjectPath,
        );
        if (activity !== null) {
          newActivities.push(activity);
        }

        // Collect agent/task tool_use events for batched send
        if (event.toolName === "Agent" || event.toolName === "Task") {
          agentToolUseIds.add(event.toolUseId);
          agentStreamBatch.push({ ...event, projectPath: derivedProjectPath });
        }
      }

      // Collect tool_result events that match known agent tool_use IDs
      if (
        event.type === "tool_result" &&
        agentToolUseIds.has(event.toolUseId)
      ) {
        agentStreamBatch.push({ ...event, projectPath: derivedProjectPath });
      }
    }

    // Send batched agent events as single IPC message
    if (agentStreamBatch.length > 0 && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.STREAM_EVENT, agentStreamBatch);
      const bucket = agentEventBuffers.get(encodedProjectDir) ?? [];
      for (const evt of agentStreamBatch) bucket.push(evt);
      if (bucket.length > MAX_AGENT_EVENTS)
        bucket.splice(0, bucket.length - MAX_AGENT_EVENTS);
      agentEventBuffers.set(encodedProjectDir, bucket);
    }

    if (analyticsChanged) {
      // Debounce the expensive save + usage scan — these do synchronous I/O
      // that blocks the main thread for 100-300ms+
      scheduleCostSave();
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(
          IPC_CHANNELS.ANALYTICS_UPDATED,
          costAggregator.getAllSummaries(),
        );
      }
      scheduleUsageUpdate();
    }

    // Push new activities to renderer and maintain ring buffer.
    if (newActivities.length > 0) {
      for (const act of newActivities) {
        activityBuffer.push(act);
      }
      // Trim to max size (FIFO — remove oldest entries from front).
      if (activityBuffer.length > MAX_ACTIVITIES) {
        activityBuffer.splice(0, activityBuffer.length - MAX_ACTIVITIES);
      }
      if (!mainWindow.isDestroyed()) {
        for (const act of newActivities) {
          mainWindow.webContents.send(IPC_CHANNELS.ACTIVITY_NEW, act);
        }
      }
    }

    // Schedule a debounced session scan — DO NOT call scanAll synchronously
    // here, as it reads every JSONL file byte-by-byte and blocks the main
    // thread for 50-500ms+. During agent spawn, processJsonlLines fires
    // hundreds of times per minute.
    scheduleSessionScan();
  }

  function startClaudeDirWatcher(): void {
    claudeDirWatcher.start({
      onSessionCreated: (sessionId: string, filePath: string) => {
        handleJsonlChangeSync(sessionId, filePath);
      },
      onSessionUpdated: (sessionId: string, filePath: string) => {
        void handleJsonlChange(sessionId, filePath);
      },
      onSessionDeleted: (_sessionId: string) => {
        // Don't call scanAll synchronously — use debounced version
        scheduleSessionScan();
      },
    });
  }

  // Start watching immediately so the renderer receives push events as soon
  // as the window is ready, without requiring an explicit invoke.
  startClaudeDirWatcher();

  // ── Lightweight async JSONL poller ─────────────────────────────────────
  // Only polls JSONL files for sessions that have active PTY processes.
  // Uses async I/O and skips progress events to minimize CPU impact.
  const trackedJsonlSizes = new Map<string, number>();

  async function pollActiveSessions(): Promise<void> {
    // Get CWDs of active PTY sessions
    const activeSessions = ptyManager.listActive();
    if (activeSessions.length === 0) return;

    const projectsDir = path.join(homeDir, ".claude", "projects");

    // For each active session, find its project directory and scan for
    // recently modified JSONL files
    const activeCwds = new Set(activeSessions.map((s) => s.cwd));

    for (const cwd of activeCwds) {
      const encodedCwd = cwd.replace(/\//g, "-");
      const projectDir = path.join(projectsDir, encodedCwd);

      try {
        const files = await fsPromises.readdir(projectDir);
        for (const file of files) {
          if (!file.endsWith(".jsonl")) continue;
          const fullPath = path.join(projectDir, file);

          try {
            const stat = await fsPromises.stat(fullPath);
            // Only check files modified in the last 2 minutes
            if (Date.now() - stat.mtimeMs > 120_000) continue;

            // First time — record size, skip
            if (!trackedJsonlSizes.has(fullPath)) {
              trackedJsonlSizes.set(fullPath, stat.size);
              if (!jsonlParsers.has(fullPath)) {
                const parser = new JsonlParser(fullPath);
                parser.offset = stat.size;
                jsonlParsers.set(fullPath, parser);
              }
              continue;
            }

            const lastSize = trackedJsonlSizes.get(fullPath)!;
            if (stat.size > lastSize) {
              trackedJsonlSizes.set(fullPath, stat.size);
              const sessionId = path.basename(file, ".jsonl");
              await handleJsonlChange(sessionId, fullPath);
            }
          } catch {
            /* ignore */
          }
        }
      } catch {
        // Project directory doesn't exist yet — normal for new sessions
      }
    }
  }

  // Poll every 10 seconds — checks active sessions for new JSONL data
  const jsonlPollInterval = setInterval(() => {
    void pollActiveSessions();
  }, 10000);

  // Clean up on app quit
  const { app: electronApp } = require("electron") as typeof import("electron");
  electronApp.on("before-quit", () => {
    clearInterval(jsonlPollInterval);
  });
}

// ─── Directory scanner ──────────────────────────────────────────────────────

interface ScannedEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  children?: ScannedEntry[];
}

const IGNORED = new Set([
  "node_modules",
  ".git",
  ".next",
  ".vercel",
  "out",
  "dist",
  ".cache",
  "__pycache__",
  ".DS_Store",
  "Thumbs.db",
]);

function scanDirectory(
  dirPath: string,
  maxDepth: number,
  depth = 0,
  relativePath = "",
): ScannedEntry[] {
  if (depth >= maxDepth) return [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: ScannedEntry[] = [];

  // Sort: directories first, then alphabetical
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of entries) {
    if (IGNORED.has(entry.name)) continue;
    if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;

    const fullPath = path.join(dirPath, entry.name);
    const isDir = entry.isDirectory();
    const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

    const node: ScannedEntry = {
      path: relPath,
      name: entry.name,
      isDirectory: isDir,
    };

    if (isDir) {
      node.children = scanDirectory(fullPath, maxDepth, depth + 1, relPath);
    }

    results.push(node);
  }

  return results;
}

// ─── Async directory scanning (doesn't block main process) ──────────────────

async function scanDirectoryAsync(
  dirPath: string,
  maxDepth: number,
  depth = 0,
  relativePath = "",
): Promise<ScannedEntry[]> {
  if (depth >= maxDepth) return [];

  let entries: fs.Dirent[];
  try {
    entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  const results: ScannedEntry[] = [];

  for (const entry of entries) {
    if (IGNORED.has(entry.name)) continue;
    if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;

    const fullPath = path.join(dirPath, entry.name);
    const isDir = entry.isDirectory();
    const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

    const node: ScannedEntry = {
      path: relPath,
      name: entry.name,
      isDirectory: isDir,
    };

    if (isDir) {
      node.children = await scanDirectoryAsync(
        fullPath,
        maxDepth,
        depth + 1,
        relPath,
      );
    }

    results.push(node);
  }

  return results;
}

// (Usage parsing is handled by PtyManager — see src/main/pty/pty-manager.ts)
