/**
 * MCPStatusService reads MCP server configurations from Claude Code's
 * config locations and merges them with auth-cache data to produce a
 * runtime status snapshot for each server.
 *
 * Config resolution order (later entries do NOT override earlier ones —
 * each file is read independently and the results are merged by server name,
 * with the global settings taking precedence for duplicates):
 *   1. ~/.claude/settings.json            (global Claude Code settings)
 *   2. .claude/settings.json (cwd-relative project settings — omitted here
 *      because the main process does not know the renderer's active cwd;
 *      the renderer is responsible for passing it if needed)
 *   3. ~/.claude/mcp-needs-auth-cache.json (per-server auth requirement cache)
 */

import fs from "fs";
import path from "path";
import type { MCPServerStatus } from "../../shared/types/mcp";

// ─── Internal shape of settings.json ──────────────────────────────────────

interface RawMCPServerEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

interface RawSettings {
  mcpServers?: Record<string, RawMCPServerEntry>;
}

// ─── Internal shape of mcp-needs-auth-cache.json ──────────────────────────

interface AuthCacheEntry {
  /** Unix timestamp (ms) when the auth requirement was last recorded. */
  timestamp: number;
}

// ─── Service ──────────────────────────────────────────────────────────────

export class MCPStatusService {
  private homeDir: string;

  constructor(homeDir: string) {
    this.homeDir = homeDir;
  }

  /**
   * Reads all MCP server configs from known Claude Code config locations
   * and merges with the auth cache to produce a status snapshot per server.
   *
   * Missing or malformed files are silently skipped — this method never
   * throws.
   */
  getServerStatuses(): MCPServerStatus[] {
    const authCache = this.readAuthCache();
    const now = Date.now();

    // Collect configs from all sources, keyed by server name.
    const serverMap = new Map<string, MCPServerStatus>();

    // Source 1: global ~/.claude/settings.json
    const globalSettings = this.readSettingsFile(
      path.join(this.homeDir, ".claude", "settings.json"),
    );
    this.mergeServers(serverMap, globalSettings, authCache, now);

    // Source 2: ~/.claude/claude_desktop_config.json (Claude Desktop format)
    const desktopConfig = this.readSettingsFile(
      path.join(this.homeDir, ".claude", "claude_desktop_config.json"),
    );
    this.mergeServers(serverMap, desktopConfig, authCache, now);

    // Source 3: Installed plugins that provide MCP servers
    this.mergePluginMcpServers(serverMap, now);

    return Array.from(serverMap.values());
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Read and parse a settings JSON file. Returns an empty object on any
   * failure (file not found, parse error, wrong shape).
   */
  private readSettingsFile(filePath: string): RawSettings {
    try {
      if (!fs.existsSync(filePath)) return {};
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;

      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        return {};
      }

      return parsed as RawSettings;
    } catch {
      return {};
    }
  }

  /**
   * Read the auth-needs cache file.
   * Returns an empty record when the file is absent or unparseable.
   */
  private readAuthCache(): Record<string, AuthCacheEntry> {
    const cachePath = path.join(
      this.homeDir,
      ".claude",
      "mcp-needs-auth-cache.json",
    );

    try {
      if (!fs.existsSync(cachePath)) return {};
      const raw = fs.readFileSync(cachePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;

      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        return {};
      }

      return parsed as Record<string, AuthCacheEntry>;
    } catch {
      return {};
    }
  }

  /**
   * Iterate over `mcpServers` entries in `settings` and upsert each into
   * `serverMap`. If a server name already exists in the map it is left
   * unchanged (global settings take precedence over desktop config).
   */
  /**
   * Detect MCP-related plugins from installed_plugins.json.
   * Plugins with "mcp" or "server" in their name are likely MCP servers.
   */
  private mergePluginMcpServers(
    serverMap: Map<string, MCPServerStatus>,
    now: number,
  ): void {
    const manifestPath = path.join(
      this.homeDir,
      ".claude",
      "plugins",
      "installed_plugins.json",
    );
    try {
      if (!fs.existsSync(manifestPath)) return;
      const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (!raw?.plugins || typeof raw.plugins !== "object") return;

      // Also read enabledPlugins from settings.json
      const settingsPath = path.join(this.homeDir, ".claude", "settings.json");
      let enabledPlugins: Record<string, boolean> = {};
      try {
        if (fs.existsSync(settingsPath)) {
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
          enabledPlugins = settings.enabledPlugins ?? {};
        }
      } catch {
        /* ignore */
      }

      for (const key of Object.keys(raw.plugins)) {
        const name = key.split("@")[0];
        if (serverMap.has(name)) continue;

        // Check if this plugin provides MCP functionality by checking its install path
        // for plugin.json with mcp config
        const versions = raw.plugins[key];
        if (!Array.isArray(versions) || versions.length === 0) continue;
        const latest = versions[versions.length - 1];
        const installPath = latest?.installPath;

        // Check if plugin has MCP-related config
        let isMcp = false;
        if (installPath) {
          try {
            // Check plugin.json for mcp-related fields
            const pluginJsonPath = path.join(
              installPath,
              ".claude-plugin",
              "plugin.json",
            );
            const altPath = path.join(installPath, ".plugin", "plugin.json");
            let pluginJson: Record<string, unknown> | null = null;
            if (fs.existsSync(pluginJsonPath)) {
              pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, "utf8"));
            } else if (fs.existsSync(altPath)) {
              pluginJson = JSON.parse(fs.readFileSync(altPath, "utf8"));
            }
            if (pluginJson) {
              // Plugins with mcpServers field are MCP providers
              if (pluginJson.mcpServers || pluginJson.mcp) {
                isMcp = true;
              }
            }
          } catch {
            /* ignore */
          }
        }

        // Also detect by plugin name containing 'mcp' or common MCP server names
        if (
          !isMcp &&
          (name.includes("mcp") ||
            name === "context7" ||
            name === "playwright" ||
            name === "github")
        ) {
          isMcp = true;
        }

        if (!isMcp) continue;

        const enabled = enabledPlugins[key] ?? false;
        serverMap.set(name, {
          name,
          status: enabled ? "disconnected" : "disconnected",
          toolCount: 0,
          lastChecked: now,
        });
      }
    } catch {
      /* ignore */
    }
  }

  private mergeServers(
    serverMap: Map<string, MCPServerStatus>,
    settings: RawSettings,
    authCache: Record<string, AuthCacheEntry>,
    now: number,
  ): void {
    const mcpServers = settings.mcpServers;
    if (!mcpServers || typeof mcpServers !== "object") return;

    for (const [name, entry] of Object.entries(mcpServers)) {
      // Do not overwrite an already-added server (global wins over desktop).
      if (serverMap.has(name)) continue;

      const needsAuth = Object.prototype.hasOwnProperty.call(authCache, name);

      const status: MCPServerStatus["status"] = needsAuth
        ? "needs-auth"
        : "disconnected";

      serverMap.set(name, {
        name,
        // We cannot probe liveness from the main process without spawning the
        // server — default to disconnected so the UI can distinguish
        // "configured but not running" from "connected".
        status,
        // Tool count is only discoverable at runtime via the MCP protocol.
        // Default to 0 until the CLI reports otherwise.
        toolCount: 0,
        lastChecked: now,
      });
    }
  }
}
