/**
 * InstalledPluginService — Reads Claude Code's plugin manifest and settings
 * to determine which plugins, hooks, and extensions are actually installed.
 *
 * Data sources:
 *   1. ~/.claude/plugins/installed_plugins.json  (authoritative install manifest)
 *   2. ~/.claude/settings.json                   (enabledPlugins + hooks config)
 *
 * Follows the same service pattern as MCPStatusService.
 */

import fs from "fs";
import path from "path";

// ─── Types ────────────────────────────────────────────────────────────────

export interface InstalledPluginInfo {
  /** Full key, e.g. "superpowers@claude-plugins-official" */
  key: string;
  /** Plugin name without marketplace, e.g. "superpowers" */
  name: string;
  /** Marketplace name, e.g. "claude-plugins-official" */
  marketplace: string;
  /** Whether enabled in settings.json enabledPlugins */
  enabled: boolean;
  /** Version string from manifest */
  version: string;
  /** ISO timestamp of installation */
  installedAt: string;
  /** ISO timestamp of last update */
  lastUpdated: string;
}

export interface InstalledHookInfo {
  /** Lifecycle event: SessionStart, PostToolUse, etc. */
  event: string;
  /** Shell command executed */
  command: string;
}

export interface InstalledExtensions {
  plugins: InstalledPluginInfo[];
  hooks: InstalledHookInfo[];
  /** Set of plugin name prefixes (before @) for quick matching */
  pluginNames: string[];
}

// ─── Raw file shapes ──────────────────────────────────────────────────────

interface RawManifest {
  version: number;
  plugins: Record<
    string,
    Array<{
      scope: string;
      installPath: string;
      version: string;
      installedAt: string;
      lastUpdated?: string;
      gitCommitSha?: string;
    }>
  >;
}

interface RawSettings {
  enabledPlugins?: Record<string, boolean>;
  hooks?: Record<
    string,
    Array<{
      hooks?: Array<{
        type: string;
        command: string;
      }>;
    }>
  >;
}

// ─── Service ──────────────────────────────────────────────────────────────

export class InstalledPluginService {
  private homeDir: string;

  constructor(homeDir: string) {
    this.homeDir = homeDir;
  }

  /**
   * Read all installed extensions from Claude Code config files.
   * Never throws — returns empty arrays on failure.
   */
  getInstalledExtensions(): InstalledExtensions {
    const manifest = this.readManifest();
    const settings = this.readSettings();
    const enabledMap = settings.enabledPlugins ?? {};

    const plugins: InstalledPluginInfo[] = [];
    const pluginNames: string[] = [];

    if (manifest.plugins) {
      for (const [key, versions] of Object.entries(manifest.plugins)) {
        const atIdx = key.indexOf("@");
        const name = atIdx !== -1 ? key.slice(0, atIdx) : key;
        const marketplace = atIdx !== -1 ? key.slice(atIdx + 1) : "";

        // Use the most recent version entry
        const latest = versions[versions.length - 1];
        if (!latest) continue;

        plugins.push({
          key,
          name,
          marketplace,
          enabled: enabledMap[key] ?? false,
          version: latest.version,
          installedAt: latest.installedAt,
          lastUpdated: latest.lastUpdated ?? latest.installedAt,
        });

        pluginNames.push(name);
      }
    }

    const hooks: InstalledHookInfo[] = [];
    if (settings.hooks) {
      for (const [event, entries] of Object.entries(settings.hooks)) {
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
          if (!entry.hooks || !Array.isArray(entry.hooks)) continue;
          for (const hook of entry.hooks) {
            if (hook.type === "command" && hook.command) {
              hooks.push({ event, command: hook.command });
            }
          }
        }
      }
    }

    return { plugins, hooks, pluginNames };
  }

  // ─── Private helpers ──────────────────────────────────────────────────

  private readManifest(): RawManifest {
    const manifestPath = path.join(
      this.homeDir,
      ".claude",
      "plugins",
      "installed_plugins.json",
    );
    try {
      if (!fs.existsSync(manifestPath)) return { version: 2, plugins: {} };
      const raw = fs.readFileSync(manifestPath, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return { version: 2, plugins: {} };
      }
      return parsed as RawManifest;
    } catch {
      return { version: 2, plugins: {} };
    }
  }

  private readSettings(): RawSettings {
    const settingsPath = path.join(
      this.homeDir,
      ".claude",
      "settings.json",
    );
    try {
      if (!fs.existsSync(settingsPath)) return {};
      const raw = fs.readFileSync(settingsPath, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      return parsed as RawSettings;
    } catch {
      return {};
    }
  }
}
