/**
 * PluginCard — Compact card for a single plugin in the Discover grid.
 *
 * Layout:
 *   Top:    Name (stone-100, 13px, semibold) + category pill (right-aligned)
 *   Middle: Description (stone-400, 11px, 2-line clamp)
 *   Bottom: Star count badge + "Install" / "Installed" button
 *
 * Install triggers the installCommand via the preload PTY bridge by writing
 * the command string into the active terminal session. Falls back to copying
 * to clipboard when no session is available.
 */

import React, { useState, useCallback } from "react";
import {
  Star,
  Check,
  Download,
  ExternalLink,
  BadgeCheck,
  X,
} from "lucide-react";
import type { PluginEntry } from "../../stores/discover-store";
import { useDiscoverStore } from "../../stores/discover-store";

// ─── Window API type ──────────────────────────────────────────────────────────

type ClaudeWindow = Window & {
  claude?: {
    installPlugin?: (
      installCommand: string,
    ) => Promise<{ ok: boolean; error?: string }>;
    getInstalledExtensions?: () => Promise<{
      pluginNames: string[];
      plugins: Array<{
        key: string;
        name: string;
        marketplace: string;
        enabled: boolean;
        version: string;
      }>;
    }>;
  };
};

// ─── Category pill colours ────────────────────────────────────────────────────

const CATEGORY_COLOURS: Record<string, string> = {
  memory: "bg-violet-900/40 text-violet-300 ring-violet-700/40",
  security: "bg-red-900/30 text-red-300 ring-red-700/40",
  analytics: "bg-blue-900/30 text-blue-300 ring-blue-700/40",
  automation: "bg-amber-900/30 text-amber-300 ring-amber-700/40",
  hooks: "bg-teal-900/30 text-teal-300 ring-teal-700/40",
  skills: "bg-emerald-900/30 text-emerald-300 ring-emerald-700/40",
  toolkit: "bg-orange-900/30 text-orange-300 ring-orange-700/40",
  mcp: "bg-indigo-900/30 text-indigo-300 ring-indigo-700/40",
};

function categoryClass(cat: string): string {
  return (
    CATEGORY_COLOURS[cat] ?? "bg-stone-800 text-stone-400 ring-stone-700/40"
  );
}

// ─── Star badge ───────────────────────────────────────────────────────────────

interface StarBadgeProps {
  count: number;
}

const StarBadge: React.FC<StarBadgeProps> = ({ count }) => {
  const formatted =
    count >= 1000
      ? `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`
      : String(count);

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-px rounded text-[9px] font-medium
        bg-stone-800 text-stone-400 ring-1 ring-stone-700/40 tabular-nums shrink-0"
      style={{ fontFamily: "'Geist Mono', 'Fira Code', monospace" }}
    >
      <Star size={8} className="text-amber-400 shrink-0" />
      {formatted}
    </span>
  );
};

// ─── Category pill ────────────────────────────────────────────────────────────

interface CategoryPillProps {
  category: string;
}

const CategoryPill: React.FC<CategoryPillProps> = ({ category }) => (
  <span
    className={`inline-flex items-center px-1.5 py-px rounded text-[9px] font-medium ring-1 shrink-0 capitalize ${categoryClass(category)}`}
    style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
  >
    {category}
  </span>
);

// ─── Install button ───────────────────────────────────────────────────────────

interface InstallButtonProps {
  plugin: PluginEntry;
  installed: boolean;
  onInstall: () => void;
}

const InstallButton: React.FC<InstallButtonProps> = ({
  plugin,
  installed,
  onInstall,
}) => {
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setInstalledPluginNames = useDiscoverStore(
    (s) => s.setInstalledPluginNames,
  );
  const setInstalledPluginData = useDiscoverStore(
    (s) => s.setInstalledPluginData,
  );

  // Detect if this is a Claude plugin command vs standalone tool
  const isClaudePlugin =
    plugin.installCommand.startsWith("claude plugin") ||
    plugin.installCommand.startsWith("claude mcp");

  const handleClick = useCallback(async () => {
    if (installed || installing) return;
    setInstalling(true);
    setError(null);

    const win = window as ClaudeWindow;

    try {
      if (win.claude?.installPlugin) {
        const result = await win.claude.installPlugin(plugin.installCommand);
        if (result.ok) {
          // Re-read installed extensions from disk to verify
          if (win.claude.getInstalledExtensions) {
            const ext = await win.claude.getInstalledExtensions();
            if (ext?.pluginNames) {
              setInstalledPluginNames(ext.pluginNames);
            }
            if (ext?.plugins) {
              setInstalledPluginData(ext.plugins);
            }
          }
          onInstall();
        } else {
          setError(result.error ?? "Install failed");
          setTimeout(() => setError(null), 5000);
        }
      } else {
        // Fallback: copy command to clipboard
        await navigator.clipboard.writeText(plugin.installCommand);
        setError("Copied — run in terminal");
        setTimeout(() => setError(null), 3000);
      }
    } catch {
      setError("Install failed");
      setTimeout(() => setError(null), 5000);
    } finally {
      setInstalling(false);
    }
  }, [
    installed,
    installing,
    plugin.installCommand,
    onInstall,
    setInstalledPluginNames,
    setInstalledPluginData,
  ]);

  // Uninstall handler — only for claude plugin/mcp type installs
  const handleUninstall = useCallback(async () => {
    if (!installed || installing) return;
    setInstalling(true);
    setError(null);

    const win = window as ClaudeWindow;
    // Derive uninstall command from install command
    let uninstallCmd = "";
    if (plugin.installCommand.startsWith("claude plugin install")) {
      uninstallCmd = plugin.installCommand.replace("install", "uninstall");
    } else if (plugin.installCommand.startsWith("claude mcp add")) {
      const parts = plugin.installCommand.split(" ");
      const serverName = parts[3]; // "claude mcp add <name> ..."
      uninstallCmd = `claude mcp remove ${serverName}`;
    } else if (plugin.installCommand.startsWith("npm install -g")) {
      uninstallCmd = plugin.installCommand.replace("install", "uninstall");
    }

    if (!uninstallCmd || !win.claude?.installPlugin) {
      setInstalling(false);
      return;
    }

    try {
      const result = await win.claude.installPlugin(uninstallCmd);
      if (result.ok) {
        // Re-read installed extensions
        if (win.claude.getInstalledExtensions) {
          const ext = await win.claude.getInstalledExtensions();
          if (ext?.pluginNames) setInstalledPluginNames(ext.pluginNames);
          if (ext?.plugins) setInstalledPluginData(ext.plugins);
        }
        // Remove from session-level tracking too
        useDiscoverStore.getState().installedIds.delete(plugin.id);
      } else {
        setError(result.error ?? "Uninstall failed");
        setTimeout(() => setError(null), 5000);
      }
    } catch {
      setError("Uninstall failed");
      setTimeout(() => setError(null), 5000);
    } finally {
      setInstalling(false);
    }
  }, [
    installed,
    installing,
    plugin.installCommand,
    plugin.id,
    setInstalledPluginNames,
    setInstalledPluginData,
  ]);

  // Show spinner for both install and uninstall operations
  if (installing) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium
          bg-stone-700/60 text-stone-300 ring-1 ring-stone-600/40 shrink-0"
        style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
      >
        <Download size={9} className="shrink-0 animate-pulse" />
        {installed ? "Removing..." : "Installing..."}
      </span>
    );
  }

  if (installed) {
    return (
      <button
        type="button"
        onClick={handleUninstall}
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium
          bg-emerald-900/30 text-emerald-400 ring-1 ring-emerald-700/40 shrink-0
          hover:bg-red-900/30 hover:text-red-400 hover:ring-red-700/40
          transition-colors duration-150 cursor-pointer group"
        style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
        title="Click to uninstall"
      >
        <Check size={9} className="shrink-0 group-hover:hidden" />
        <X size={9} className="shrink-0 hidden group-hover:block" />
        <span className="group-hover:hidden">Installed</span>
        <span className="hidden group-hover:inline">Uninstall</span>
      </button>
    );
  }

  if (error) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium
          bg-red-900/30 text-red-400 ring-1 ring-red-700/40 shrink-0 max-w-[140px] truncate"
        style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
        title={error}
      >
        {error}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium
        bg-[#e8a872]/15 text-[#e8a872] ring-1 ring-[#e8a872]/30
        hover:bg-[#e8a872]/25 hover:ring-[#e8a872]/50
        active:bg-[#e8a872]/20 transition-colors duration-100 shrink-0 cursor-pointer"
      style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
      title={plugin.installCommand}
    >
      <Download size={9} className="shrink-0" />
      Install
    </button>
  );
};

// ─── GitHub link ──────────────────────────────────────────────────────────────

interface GitHubLinkProps {
  repo: string;
}

const GitHubLink: React.FC<GitHubLinkProps> = ({ repo }) => {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      window.open(`https://github.com/${repo}`, "_blank");
    },
    [repo],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1 shrink-0 text-stone-600 hover:text-stone-400 transition-colors duration-100 cursor-pointer"
      title={`Open ${repo} on GitHub`}
    >
      <ExternalLink size={10} />
    </button>
  );
};

// ─── Main card ────────────────────────────────────────────────────────────────

interface PluginCardProps {
  plugin: PluginEntry;
}

const PluginCard: React.FC<PluginCardProps> = ({ plugin }) => {
  const installedIds = useDiscoverStore((s) => s.installedIds);
  const installedPluginNames = useDiscoverStore((s) => s.installedPluginNames);
  const markInstalled = useDiscoverStore((s) => s.markInstalled);

  // Check install status from both session and disk state
  const installed = React.useMemo(() => {
    if (installedIds.has(plugin.id)) return true;
    // Check pluginIds mapping
    if (plugin.pluginIds) {
      for (const pid of plugin.pluginIds) {
        if (installedPluginNames.has(pid)) return true;
      }
    }
    if (installedPluginNames.has(plugin.id)) return true;
    for (const name of installedPluginNames) {
      if (
        name === plugin.id ||
        name.includes(plugin.id) ||
        plugin.id.includes(name)
      )
        return true;
    }
    return false;
  }, [plugin, installedIds, installedPluginNames]);

  const handleInstall = useCallback(() => {
    markInstalled(plugin.id);
  }, [plugin.id, markInstalled]);

  return (
    <div
      className={[
        "flex flex-col gap-1.5 px-3 py-2.5 rounded-md border transition-colors duration-100",
        installed
          ? "bg-stone-900/60 border-stone-700/50"
          : "bg-stone-900 border-stone-800 hover:border-stone-700",
      ].join(" ")}
      style={{ minHeight: 80 }}
    >
      {/* Row 1: name + category */}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <span
          className="text-stone-100 font-semibold leading-tight truncate inline-flex items-center gap-1.5"
          style={{ fontSize: 13, fontFamily: "'Geist', system-ui, sans-serif" }}
          title={plugin.name}
        >
          {plugin.essential && (
            <BadgeCheck size={10} className="text-amber-400 shrink-0" />
          )}
          {plugin.name}
        </span>
        <CategoryPill category={plugin.category} />
      </div>

      {/* Row 2: description */}
      <p
        className="text-stone-400 leading-snug flex-1"
        style={{
          fontSize: 11,
          fontFamily: "'Geist', system-ui, sans-serif",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
        title={plugin.description}
      >
        {plugin.description}
      </p>

      {/* Row 3: creator + star count + github link + install button */}
      <div className="flex items-center gap-1.5 mt-auto pt-0.5">
        <span
          className="text-stone-600 truncate"
          style={{
            fontSize: 9,
            fontFamily: "'Geist Mono', monospace",
            maxWidth: 80,
          }}
          title={plugin.repo}
        >
          {plugin.repo.split("/")[0]}
        </span>
        <StarBadge count={plugin.stars} />
        <GitHubLink repo={plugin.repo} />
        <div className="flex-1" />
        <InstallButton
          plugin={plugin}
          installed={installed}
          onInstall={handleInstall}
        />
      </div>
    </div>
  );
};

export default PluginCard;
