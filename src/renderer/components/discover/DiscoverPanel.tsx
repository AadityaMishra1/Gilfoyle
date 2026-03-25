/**
 * DiscoverPanel — Full-screen overlay for browsing and installing Claude Code
 * plugins, hooks, and skills from the curated registry + GitHub discovery.
 *
 * Layout:
 *   - Fixed overlay backdrop (bg-black/60, backdrop-blur-sm)
 *   - Centred modal (max-w-3xl, max-h-[85vh])
 *   - Header: title + plugin count + close (X) button
 *   - Essentials banner (when "All" or "Essentials" category is active)
 *   - Search bar
 *   - Category filter pills (All + Essentials + one per category)
 *   - 2-column grid of PluginCards
 *   - Empty state when filters produce no results
 */

import React, { useEffect, useCallback, useRef } from "react";
import { X, Search, Package, ShieldCheck, RefreshCw } from "lucide-react";
import { useDiscoverStore } from "../../stores/discover-store";
import type { PluginCategory, PluginEntry } from "../../stores/discover-store";
import PluginCard from "./PluginCard";
import registryData from "../../../shared/data/plugin-registry.json";

// ─── Category filter pill ─────────────────────────────────────────────────────

interface CategoryPillProps {
  id: string;
  name: string;
  active: boolean;
  onClick: (id: string) => void;
  accent?: boolean;
}

const CategoryFilterPill: React.FC<CategoryPillProps> = ({
  id,
  name,
  active,
  onClick,
  accent,
}) => (
  <button
    type="button"
    onClick={() => onClick(id)}
    className={[
      "px-2.5 py-1 rounded text-[11px] font-medium transition-colors duration-100 shrink-0 cursor-pointer",
      active
        ? accent
          ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40"
          : "bg-[#e8a872]/20 text-[#e8a872] ring-1 ring-[#e8a872]/40"
        : "bg-stone-800/80 text-stone-400 hover:bg-stone-700/80 hover:text-stone-300 ring-1 ring-stone-700/40",
    ].join(" ")}
    style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
  >
    {name}
  </button>
);

// ─── Essentials banner ───────────────────────────────────────────────────────

interface EssentialsBannerProps {
  essentials: PluginEntry[];
}

const EssentialsBanner: React.FC<EssentialsBannerProps> = ({ essentials }) => {
  return (
    <div className="mx-4 mt-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/15">
      <div className="flex items-center gap-2 min-w-0">
        <ShieldCheck size={14} className="text-amber-400 shrink-0" />
        <div className="min-w-0">
          <span
            className="text-amber-300 font-medium block"
            style={{
              fontSize: 12,
              fontFamily: "'Geist', system-ui, sans-serif",
            }}
          >
            Essential Plugins
          </span>
          <span
            className="text-stone-500 block"
            style={{ fontSize: 10, fontFamily: "'Geist Mono', monospace" }}
          >
            {essentials.length} recommended — click View Repo for install
            instructions
          </span>
        </div>
      </div>
    </div>
  );
};

// ─── Empty state ──────────────────────────────────────────────────────────────

const EmptyState: React.FC<{ hasQuery: boolean }> = ({ hasQuery }) => (
  <div className="flex flex-col items-center justify-center py-16 gap-3 col-span-2">
    <div className="p-3 rounded-full bg-stone-800/60 ring-1 ring-stone-700/40">
      <Package size={20} className="text-stone-500" />
    </div>
    <div className="text-center">
      <p className="text-stone-400 text-sm font-medium mb-1">
        {hasQuery
          ? "No plugins match your search"
          : "No plugins in this category"}
      </p>
      <p
        className="text-stone-600 text-xs leading-relaxed"
        style={{ fontFamily: "'Geist Mono', monospace" }}
      >
        {hasQuery
          ? "Try a different search term or category."
          : 'Select "All" to see everything.'}
      </p>
    </div>
  </div>
);

// ─── Main panel ───────────────────────────────────────────────────────────────

const DiscoverPanel: React.FC = () => {
  const discoverOpen = useDiscoverStore((s) => s.discoverOpen);
  const setDiscoverOpen = useDiscoverStore((s) => s.setDiscoverOpen);
  const setPlugins = useDiscoverStore((s) => s.setPlugins);
  const searchQuery = useDiscoverStore((s) => s.searchQuery);
  const setSearchQuery = useDiscoverStore((s) => s.setSearchQuery);
  const activeCategory = useDiscoverStore((s) => s.activeCategory);
  const setActiveCategory = useDiscoverStore((s) => s.setActiveCategory);
  const getFiltered = useDiscoverStore((s) => s.getFiltered);
  const getEssentials = useDiscoverStore((s) => s.getEssentials);
  const isInstalled = useDiscoverStore((s) => s.isInstalled);
  const markInstalled = useDiscoverStore((s) => s.markInstalled);
  const setInstalledPluginNames = useDiscoverStore(
    (s) => s.setInstalledPluginNames,
  );
  const setInstalledPluginData = useDiscoverStore(
    (s) => s.setInstalledPluginData,
  );
  const discovering = useDiscoverStore((s) => s.discovering);
  const setDiscovering = useDiscoverStore((s) => s.setDiscovering);
  const plugins = useDiscoverStore((s) => s.plugins);

  const searchRef = useRef<HTMLInputElement>(null);

  // Load bundled registry + real installed state on mount.
  useEffect(() => {
    setPlugins(registryData.plugins as PluginEntry[]);

    // Load actually-installed plugins from ~/.claude/plugins/installed_plugins.json
    const win = window as Window & {
      claude?: {
        discoverPlugins?: () => Promise<PluginEntry[]>;
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

    if (win.claude?.getInstalledExtensions) {
      win.claude
        .getInstalledExtensions()
        .then((ext) => {
          if (ext) {
            if (ext.pluginNames) {
              setInstalledPluginNames(ext.pluginNames);
            }
            if (ext.plugins) {
              setInstalledPluginData(ext.plugins);
            }
          }
        })
        .catch(() => {});
    }

    // Background: try live discovery
    if (win.claude?.discoverPlugins) {
      setDiscovering(true);
      win.claude
        .discoverPlugins()
        .then((discovered) => {
          if (discovered && discovered.length > 0) {
            setPlugins(discovered);
          }
        })
        .catch(() => {
          // Keep bundled registry
        })
        .finally(() => setDiscovering(false));
    }
  }, [
    setPlugins,
    setDiscovering,
    setInstalledPluginNames,
    setInstalledPluginData,
  ]);

  // Refresh discovery on demand
  const handleRefreshDiscovery = useCallback(() => {
    const win = window as Window & {
      claude?: { discoverPlugins?: () => Promise<PluginEntry[]> };
    };
    if (!win.claude?.discoverPlugins) return;
    setDiscovering(true);
    win.claude
      .discoverPlugins()
      .then((discovered) => {
        if (discovered && discovered.length > 0) {
          setPlugins(discovered);
        }
      })
      .catch(() => {})
      .finally(() => setDiscovering(false));
  }, [setPlugins, setDiscovering]);

  // Focus search on open.
  useEffect(() => {
    if (discoverOpen) {
      const timer = setTimeout(() => searchRef.current?.focus(), 60);
      return () => clearTimeout(timer);
    }
  }, [discoverOpen]);

  // Close on Escape.
  useEffect(() => {
    if (!discoverOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDiscoverOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [discoverOpen, setDiscoverOpen]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) setDiscoverOpen(false);
    },
    [setDiscoverOpen],
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    [setSearchQuery],
  );

  const handleInstallAllEssentials = useCallback(() => {
    const essentials = getEssentials();
    for (const p of essentials) {
      if (!isInstalled(p)) {
        markInstalled(p.id);
        // Send install command to active PTY if available
        const win = window as Window & {
          claude?: {
            sendInput?: (sessionId: string, data: string) => Promise<void>;
            listSessions?: () => Promise<Array<{ sessionId: string }>>;
          };
        };
        if (win.claude?.sendInput && win.claude?.listSessions) {
          win.claude
            .listSessions()
            .then((sessions) => {
              if (sessions.length > 0) {
                win.claude?.sendInput?.(
                  sessions[0].sessionId,
                  p.installCommand + "\n",
                );
              }
            })
            .catch(() => {});
        }
      }
    }
  }, [getEssentials, isInstalled, markInstalled]);

  if (!discoverOpen) return null;

  const filtered = getFiltered();
  const essentials = getEssentials();
  const categories = registryData.categories as PluginCategory[];
  const hasQuery = searchQuery.trim().length > 0;
  const showEssentialsBanner =
    !hasQuery &&
    (activeCategory === "all" || activeCategory === "essentials") &&
    essentials.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backgroundColor: "var(--backdrop)",
        backdropFilter: "blur(4px)",
      }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Discover plugins"
    >
      <div
        className="flex flex-col w-full max-w-3xl rounded-xl border border-stone-700/60 overflow-hidden"
        style={{
          backgroundColor: "var(--bg-elevated)",
          maxHeight: "85vh",
          boxShadow: "0 32px 64px rgba(0,0,0,0.6)",
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-800 shrink-0">
          <Package size={15} className="text-[#e8a872] shrink-0" />
          <span
            className="text-stone-100 font-semibold flex-1"
            style={{
              fontSize: 14,
              fontFamily: "'Geist', system-ui, sans-serif",
            }}
          >
            Discover
          </span>
          <span
            className="text-stone-500 text-xs mr-1"
            style={{ fontFamily: "'Geist Mono', monospace" }}
          >
            {plugins.length} plugins
          </span>
          <button
            type="button"
            onClick={handleRefreshDiscovery}
            disabled={discovering}
            className="flex items-center justify-center w-6 h-6 rounded text-stone-500
              hover:text-stone-300 hover:bg-stone-700/60 transition-colors duration-100 cursor-pointer
              disabled:opacity-30"
            title="Refresh from GitHub"
            aria-label="Refresh plugin discovery"
          >
            <RefreshCw
              size={12}
              className={discovering ? "animate-spin" : ""}
            />
          </button>
          <button
            type="button"
            onClick={() => setDiscoverOpen(false)}
            className="flex items-center justify-center w-6 h-6 rounded text-stone-500
              hover:text-stone-200 hover:bg-stone-700/60 transition-colors duration-100 cursor-pointer"
            aria-label="Close Discover panel"
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Essentials banner ───────────────────────────────────────────── */}
        {showEssentialsBanner && <EssentialsBanner essentials={essentials} />}

        {/* ── Search + filters ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2.5 px-4 py-3 border-b border-stone-800 shrink-0">
          {/* Search input */}
          <div className="relative">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 pointer-events-none"
            />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search plugins, tags..."
              className="w-full pl-8 pr-3 py-1.5 rounded-md bg-stone-800/80 border border-stone-700/60
                text-stone-200 placeholder-stone-600 outline-none
                focus:border-[#e8a872]/40 focus:ring-1 focus:ring-[#e8a872]/20 transition-colors duration-100"
              style={{
                fontSize: 12,
                fontFamily: "'Geist', system-ui, sans-serif",
              }}
            />
          </div>

          {/* Category pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <CategoryFilterPill
              id="all"
              name="All"
              active={activeCategory === "all"}
              onClick={setActiveCategory}
            />
            <CategoryFilterPill
              id="essentials"
              name="Essentials"
              active={activeCategory === "essentials"}
              onClick={setActiveCategory}
              accent
            />
            <CategoryFilterPill
              id="installed"
              name="Installed"
              active={activeCategory === "installed"}
              onClick={setActiveCategory}
            />
            {categories.map((cat) => (
              <CategoryFilterPill
                key={cat.id}
                id={cat.id}
                name={cat.name}
                active={activeCategory === cat.id}
                onClick={setActiveCategory}
              />
            ))}
          </div>
        </div>

        {/* ── Plugin grid ──────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4">
          <div className="grid grid-cols-2 gap-2.5">
            {filtered.length === 0 ? (
              <EmptyState hasQuery={hasQuery} />
            ) : (
              filtered.map((plugin) => (
                <PluginCard key={plugin.id} plugin={plugin} />
              ))
            )}
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center justify-between px-4 py-2 border-t border-stone-800">
          <span
            className="text-stone-600 text-[10px]"
            style={{ fontFamily: "'Geist Mono', monospace" }}
          >
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            {activeCategory !== "all" ? ` in ${activeCategory}` : ""}
          </span>
          <span
            className="text-stone-700 text-[10px]"
            style={{ fontFamily: "'Geist Mono', monospace" }}
          >
            ESC to close
          </span>
        </div>
      </div>
    </div>
  );
};

export default DiscoverPanel;
