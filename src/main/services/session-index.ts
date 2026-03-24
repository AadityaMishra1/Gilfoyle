import fs from "fs";
import path from "path";
import { decodeProjectPath } from "../../shared/utils/path-decoder";
import { calculateMessageCost } from "../../shared/pricing";
import type { SessionMeta } from "../../shared/types/session";
import type { ProjectInfo } from "../../shared/ipc-channels";

/**
 * Maximum number of lines read from the start of a file when extracting
 * session metadata (sessionId, model, timestamps).
 */
const HEAD_LINES = 5;

/**
 * Maximum number of bytes read from the tail of a file when looking for
 * the most recent timestamp and model.
 */
const TAIL_BYTES = 4096;

/**
 * Read the first N lines from a file without loading the entire file.
 */
function readHeadLines(filePath: string, n: number): string[] {
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, "r");
    const buf = Buffer.allocUnsafe(8192);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    const text = buf.subarray(0, bytesRead).toString("utf8");
    return text.split("\n").slice(0, n);
  } catch {
    return [];
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Read the last TAIL_BYTES of a file and return the non-empty lines found
 * there.  Used to cheaply extract the most recent timestamp and model slug.
 */
function readTailLines(filePath: string): string[] {
  let fd: number | undefined;
  try {
    const stats = fs.statSync(filePath);
    const offset = Math.max(0, stats.size - TAIL_BYTES);
    fd = fs.openSync(filePath, "r");
    const buf = Buffer.allocUnsafe(TAIL_BYTES);
    const bytesRead = fs.readSync(fd, buf, 0, TAIL_BYTES, offset);
    const text = buf.subarray(0, bytesRead).toString("utf8");
    return text.split("\n").filter((l) => l.trim().length > 0);
  } catch {
    return [];
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Attempt to parse a line as JSON.  Returns null on failure.
 */
function tryParse(line: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(line.trim());
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

function getUsage(obj: Record<string, unknown>): {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
} | null {
  const usage = (obj["message"] as Record<string, unknown> | undefined)?.[
    "usage"
  ];
  if (usage === null || typeof usage !== "object") return null;
  const u = usage as Record<string, unknown>;
  return {
    input: num(u["input_tokens"]),
    output: num(u["output_tokens"]),
    cacheRead: num(u["cache_read_input_tokens"]),
    cacheWrite: num(u["cache_creation_input_tokens"]),
  };
}

/**
 * Parse all token usage totals from a JSONL file by scanning every line.
 * This is intentionally done in a single sequential read to avoid holding
 * multiple file descriptors open.
 */
function accumulateTokensFromFile(filePath: string): {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  estimatedCostUSD: number;
  lastModel: string;
  lastTimestamp: number;
  firstTimestamp: number;
  gitBranch: string | undefined;
  sessionIdFromContent: string | undefined;
} {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheWriteTokens = 0;
  let estimatedCostUSD = 0;
  let lastModel = "";
  let lastTimestamp = 0;
  let firstTimestamp = 0;
  let gitBranch: string | undefined;
  let sessionIdFromContent: string | undefined;

  let fd: number | undefined;
  try {
    const stats = fs.statSync(filePath);
    fd = fs.openSync(filePath, "r");
    const CHUNK = 65536;
    const buf = Buffer.allocUnsafe(CHUNK);
    let fileOffset = 0;
    let leftover = "";

    while (fileOffset < stats.size) {
      const bytesRead = fs.readSync(fd, buf, 0, CHUNK, fileOffset);
      if (bytesRead === 0) break;
      fileOffset += bytesRead;

      const chunk = leftover + buf.subarray(0, bytesRead).toString("utf8");
      const lines = chunk.split("\n");
      // The last element may be a partial line — carry it forward.
      leftover = lines.pop() ?? "";

      for (const line of lines) {
        const obj = tryParse(line);
        if (obj === null) continue;

        // First timestamp encountered is the session creation time.
        const ts = num(obj["timestamp"]);
        if (ts > 0) {
          if (firstTimestamp === 0) firstTimestamp = ts;
          if (ts > lastTimestamp) lastTimestamp = ts;
        }

        // Session-level metadata carried on certain line types.
        if (
          sessionIdFromContent === undefined &&
          typeof obj["sessionId"] === "string"
        ) {
          sessionIdFromContent = str(obj["sessionId"]);
        }
        if (gitBranch === undefined && typeof obj["gitBranch"] === "string") {
          gitBranch = str(obj["gitBranch"]);
        }

        // Token usage — only present on assistant messages.
        if (str(obj["type"]) === "assistant") {
          const model = str(
            (obj["message"] as Record<string, unknown> | undefined)?.["model"],
          );
          if (model.length > 0) lastModel = model;

          const usage = getUsage(obj);
          if (usage !== null) {
            totalInputTokens += usage.input;
            totalOutputTokens += usage.output;
            totalCacheReadTokens += usage.cacheRead;
            totalCacheWriteTokens += usage.cacheWrite;

            if (lastModel.length > 0) {
              estimatedCostUSD += calculateMessageCost(
                lastModel,
                usage.input,
                usage.output,
                usage.cacheRead,
                usage.cacheWrite,
              );
            }
          }
        }
      }
    }

    // Process any remaining partial line.
    if (leftover.trim().length > 0) {
      const obj = tryParse(leftover);
      if (obj !== null) {
        const ts = num(obj["timestamp"]);
        if (ts > 0 && ts > lastTimestamp) lastTimestamp = ts;
      }
    }
  } catch {
    // File may be unreadable — return zeroed accumulator.
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }

  return {
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    totalCacheWriteTokens,
    estimatedCostUSD,
    lastModel,
    lastTimestamp,
    firstTimestamp,
    gitBranch,
    sessionIdFromContent,
  };
}

/**
 * Recursively find all `.jsonl` files under `rootDir`.
 */
function findJsonlFiles(rootDir: string): string[] {
  const results: string[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findJsonlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      results.push(full);
    }
  }

  return results;
}

/**
 * Indexes Claude Code session files from disk.
 *
 * Each session corresponds to a JSONL file at:
 *   `~/.claude/projects/{encoded-cwd}/{session-id}.jsonl`
 */
export class SessionIndex {
  /**
   * Scan `~/.claude/projects/` for all JSONL session files and return an
   * array of {@link SessionMeta} objects enriched with token totals and cost.
   *
   * @param homeDir - The user's home directory (e.g. from `os.homedir()`).
   */
  scanAll(homeDir: string): SessionMeta[] {
    const projectsDir = path.join(homeDir, ".claude", "projects");

    if (!fs.existsSync(projectsDir)) {
      return [];
    }

    const files = findJsonlFiles(projectsDir);
    const sessions: SessionMeta[] = [];

    for (const filePath of files) {
      const session = this.parseSessionFile(filePath, projectsDir);
      if (session !== null) {
        sessions.push(session);
      }
    }

    // Sort most-recently-active first.
    sessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
    return sessions;
  }

  private parseSessionFile(
    filePath: string,
    projectsDir: string,
  ): SessionMeta | null {
    try {
      // The sessionId is the filename without the .jsonl extension.
      const filename = path.basename(filePath);
      if (!filename.endsWith(".jsonl")) return null;
      const sessionId = filename.slice(0, -".jsonl".length);
      if (sessionId.length === 0) return null;

      // The encoded cwd is the name of the immediate parent directory.
      const encodedCwd = path.basename(path.dirname(filePath));
      const cwd =
        encodedCwd !== path.basename(projectsDir)
          ? decodeProjectPath(encodedCwd)
          : homeDir(projectsDir);

      const accumulated = accumulateTokensFromFile(filePath);

      // Prefer timestamp from content; fall back to filesystem mtime/ctime.
      const stats = fs.statSync(filePath);
      const createdAt =
        accumulated.firstTimestamp > 0
          ? accumulated.firstTimestamp
          : stats.ctimeMs;

      const lastActiveAt =
        accumulated.lastTimestamp > 0
          ? accumulated.lastTimestamp
          : stats.mtimeMs;

      // Build a short display name from the cwd's final path segment.
      const dirName = path.basename(cwd);
      const name = dirName.length > 0 ? dirName : sessionId.slice(0, 8);

      // Quick metadata pass for model — try head lines first as they are cheaper.
      const headLines = readHeadLines(filePath, HEAD_LINES);
      let model = accumulated.lastModel;
      if (model.length === 0) {
        for (const line of headLines) {
          const obj = tryParse(line);
          if (obj === null) continue;
          const m = str(
            (obj["message"] as Record<string, unknown> | undefined)?.["model"],
          );
          if (m.length > 0) {
            model = m;
            break;
          }
        }
      }

      // gitBranch — also check head lines first.
      let gitBranch = accumulated.gitBranch;
      if (gitBranch === undefined) {
        for (const line of [...headLines, ...readTailLines(filePath)]) {
          const obj = tryParse(line);
          if (obj === null) continue;
          if (typeof obj["gitBranch"] === "string") {
            gitBranch = str(obj["gitBranch"]);
            break;
          }
        }
      }

      return {
        sessionId,
        name,
        cwd,
        createdAt,
        lastActiveAt,
        model: model.length > 0 ? model : undefined,
        gitBranch,
        totalInputTokens: accumulated.totalInputTokens,
        totalOutputTokens: accumulated.totalOutputTokens,
        totalCacheReadTokens: accumulated.totalCacheReadTokens,
        totalCacheWriteTokens: accumulated.totalCacheWriteTokens,
        estimatedCostUSD: accumulated.estimatedCostUSD,
        // A session on disk is never considered actively running — the PTY
        // manager owns that status flag.
        isActive: false,
      };
    } catch (err) {
      console.warn(
        `[SessionIndex] Failed to parse session file ${filePath}:`,
        err,
      );
      return null;
    }
  }

  /**
   * Return one {@link ProjectInfo} entry per unique project directory found in
   * `~/.claude/projects/`.  Cheap: reads only directory entries, not file
   * contents, except for a single `statSync` per JSONL file to get mtime.
   *
   * @param homeDir - The user's home directory (e.g. from `os.homedir()`).
   */
  getProjectPaths(homeDir: string): ProjectInfo[] {
    const projectsDir = path.join(homeDir, ".claude", "projects");

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const results: ProjectInfo[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const encodedCwd = entry.name;

      // Skip Claude worktree directories (temporary, auto-cleaned).
      if (encodedCwd.includes("--claude-worktrees")) continue;

      const projectPath = decodeProjectPath(encodedCwd);

      // Skip paths that no longer exist on disk.
      if (!fs.existsSync(projectPath)) continue;

      const projectDir = path.join(projectsDir, encodedCwd);

      // Count JSONL files and find the most recent mtime.
      let sessionCount = 0;
      let lastActiveAt = 0;

      let children: fs.Dirent[];
      try {
        children = fs.readdirSync(projectDir, { withFileTypes: true });
      } catch {
        children = [];
      }

      for (const child of children) {
        if (!child.isFile() || !child.name.endsWith(".jsonl")) continue;
        sessionCount += 1;
        try {
          const mtime = fs.statSync(path.join(projectDir, child.name)).mtimeMs;
          if (mtime > lastActiveAt) lastActiveAt = mtime;
        } catch {
          // Skip unreadable files.
        }
      }

      if (sessionCount === 0) continue;

      const name = path.basename(projectPath) || encodedCwd;

      results.push({ path: projectPath, name, sessionCount, lastActiveAt });
    }

    // Most-recently-active project first.
    results.sort((a, b) => b.lastActiveAt - a.lastActiveAt);

    // Filter out parent directories that are parents of other results
    // (e.g. /Users/x/Projects when /Users/x/Projects/Gilfoyle also exists).
    const paths = new Set(results.map((r) => r.path));
    const filtered = results.filter((r) => {
      for (const other of paths) {
        if (other !== r.path && other.startsWith(r.path + "/")) {
          return false;
        }
      }
      return true;
    });

    return filtered;
  }
}

/** Fallback: derive home dir from the projects path. */
function homeDir(projectsDir: string): string {
  return path.dirname(path.dirname(projectsDir));
}
