import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OAuthUsageData {
  /** 5-hour rolling window utilization (0-100). */
  fiveHour: number;
  /** 7-day rolling window utilization (0-100). */
  sevenDay: number;
  /** ISO timestamp when the 5-hour window resets, or null. */
  fiveHourResetsAt: string | null;
  /** ISO timestamp when the 7-day window resets, or null. */
  sevenDayResetsAt: string | null;
  /** When this data was fetched (Unix ms). */
  capturedAt: number;
}

// ─── Service ────────────────────────────────────────────────────────────────

const USAGE_ENDPOINT = "https://api.anthropic.com/api/oauth/usage";
const CACHE_TTL_MS = 300_000; // 5-minute in-memory cache (usage changes slowly)
const POLL_INTERVAL_MS = 600_000; // Poll every 10 minutes (avoids API rate-limiting)
const KEYCHAIN_SERVICE = "Claude Code-credentials";

/**
 * Fetches real Claude subscription usage from the OAuth usage endpoint.
 *
 * Token is extracted from macOS Keychain where Claude Code stores its OAuth
 * credentials. Results are cached in memory and persisted to disk.
 */
export class OAuthUsageService {
  private cached: OAuthUsageData | null = null;
  private cacheFile: string;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private onUpdate: ((data: OAuthUsageData) => void) | null = null;
  /** Fires when API is rate-limited — triggers PTY /usage as fallback. */
  private onPtyFallback: (() => void) | null = null;
  /** In-flight fetch promise — prevents concurrent API calls from component re-mounts. */
  private inflight: Promise<OAuthUsageData | null> | null = null;

  constructor(dataDir: string) {
    this.cacheFile = path.join(dataDir, "usage-cache.json");
    this.loadFromDisk();
  }

  /**
   * Register a callback for when new usage data is fetched.
   */
  setUpdateCallback(cb: (data: OAuthUsageData) => void): void {
    this.onUpdate = cb;
    // Push cached data immediately so the renderer has something to display
    // even before the first API call (which may be rate-limited).
    if (this.cached !== null) {
      cb(this.cached);
    }
  }

  /**
   * Register a fallback that runs when the API is rate-limited.
   * Wired to ptyManager.requestUsage() to send /usage to an active session.
   */
  setPtyFallback(cb: () => void): void {
    this.onPtyFallback = cb;
  }

  /**
   * Start background polling.
   */
  startPolling(): void {
    if (this.pollTimer !== null) return;
    // Fetch immediately on start
    void this.fetchUsage();
    this.pollTimer = setInterval(() => {
      void this.fetchUsage();
    }, POLL_INTERVAL_MS);
  }

  /**
   * Stop background polling.
   */
  stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Get cached usage data. Returns null if never fetched.
   */
  getCached(): OAuthUsageData | null {
    return this.cached;
  }

  /**
   * Fetch usage data, using in-memory cache if fresh.
   * Multiple concurrent callers share one in-flight request.
   */
  async getUsage(): Promise<OAuthUsageData | null> {
    if (
      this.cached !== null &&
      Date.now() - this.cached.capturedAt < CACHE_TTL_MS
    ) {
      return this.cached;
    }
    return this.fetchUsage();
  }

  /**
   * Force-fetch fresh usage data from the API.
   * Deduplicates concurrent calls — only one HTTP request at a time.
   */
  async fetchUsage(): Promise<OAuthUsageData | null> {
    // If a fetch is already in progress, piggyback on it instead of firing another.
    if (this.inflight) return this.inflight;

    this.inflight = this.doFetch();
    try {
      return await this.inflight;
    } finally {
      this.inflight = null;
    }
  }

  private async doFetch(): Promise<OAuthUsageData | null> {
    const token = this.extractOAuthToken();
    if (token === null) return this.cached;

    try {
      // Lazy-import net to avoid issues during module load before app.whenReady()
      const { net } = await import("electron");
      const response = await net.fetch(USAGE_ENDPOINT, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "anthropic-beta": "oauth-2025-04-20",
        },
      });

      if (!response.ok) {
        // Rate-limited or other error — push cached data to renderer and
        // trigger PTY /usage fallback for fresh data from the CLI.
        if (this.cached && this.onUpdate) this.onUpdate(this.cached);
        if (this.onPtyFallback) this.onPtyFallback();
        return this.cached;
      }

      const body = (await response.json()) as Record<string, unknown>;

      const fiveHourObj = body["five_hour"] as
        | Record<string, unknown>
        | undefined;
      const sevenDayObj = body["seven_day"] as
        | Record<string, unknown>
        | undefined;

      const fiveHour =
        typeof fiveHourObj?.["utilization"] === "number"
          ? (fiveHourObj["utilization"] as number)
          : 0;
      const sevenDay =
        typeof sevenDayObj?.["utilization"] === "number"
          ? (sevenDayObj["utilization"] as number)
          : 0;
      const fiveHourResetsAt =
        typeof fiveHourObj?.["resets_at"] === "string"
          ? (fiveHourObj["resets_at"] as string)
          : null;
      const sevenDayResetsAt =
        typeof sevenDayObj?.["resets_at"] === "string"
          ? (sevenDayObj["resets_at"] as string)
          : null;

      const data: OAuthUsageData = {
        fiveHour: Math.round(fiveHour),
        sevenDay: Math.round(sevenDay),
        fiveHourResetsAt,
        sevenDayResetsAt,
        capturedAt: Date.now(),
      };

      this.cached = data;
      this.persistToDisk(data);

      if (this.onUpdate) {
        this.onUpdate(data);
      }

      return data;
    } catch {
      // Network error, timeout, etc. — return cached.
      return this.cached;
    }
  }

  /**
   * Extract the OAuth access token.
   *
   * On macOS, reads from the Keychain where Claude Code stores credentials.
   * On Windows/Linux, falls back to reading Claude Code's credential file from disk.
   */
  private extractOAuthToken(): string | null {
    // macOS: read from Keychain
    if (process.platform === "darwin") {
      try {
        const raw = execFileSync(
          "security",
          ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
          { encoding: "utf8", timeout: 5000 },
        ).trim();

        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const oauthEntry = parsed["claudeAiOauth"] as
          | Record<string, unknown>
          | undefined;
        if (oauthEntry && typeof oauthEntry["accessToken"] === "string") {
          return oauthEntry["accessToken"] as string;
        }

        return null;
      } catch {
        return null;
      }
    }

    // Windows/Linux: try to read from Claude Code's credential file on disk.
    // Claude Code may store credentials at ~/.claude/credentials.json or similar.
    try {
      const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
      const credPaths = [
        path.join(home, ".claude", "credentials.json"),
        path.join(home, ".claude", ".credentials.json"),
      ];

      for (const credPath of credPaths) {
        if (!fs.existsSync(credPath)) continue;
        const raw = fs.readFileSync(credPath, "utf8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const oauthEntry = parsed["claudeAiOauth"] as
          | Record<string, unknown>
          | undefined;
        if (oauthEntry && typeof oauthEntry["accessToken"] === "string") {
          return oauthEntry["accessToken"] as string;
        }
      }
    } catch {
      // Non-fatal — credential file may not exist
    }

    return null;
  }

  private persistToDisk(data: OAuthUsageData): void {
    try {
      const dir = path.dirname(this.cacheFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.cacheFile, JSON.stringify(data), "utf8");
    } catch {
      // Non-fatal — cache is best-effort.
    }
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.cacheFile)) return;
      const raw = fs.readFileSync(this.cacheFile, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (
        typeof parsed["fiveHour"] === "number" &&
        typeof parsed["sevenDay"] === "number" &&
        typeof parsed["capturedAt"] === "number"
      ) {
        this.cached = parsed as unknown as OAuthUsageData;
      }
    } catch {
      // Corrupt cache file — ignore.
    }
  }
}
