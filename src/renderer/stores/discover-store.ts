/**
 * Zustand store for the Discover panel — plugin registry browsing and
 * install-state tracking across the app lifetime.
 *
 * Install detection reads from ~/.claude/plugins/installed_plugins.json
 * (the authoritative manifest) and cross-references with the registry.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PluginEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  stars: number;
  repo: string;
  installCommand: string;
  tags: string[];
  essential?: boolean;
  source?: "bundled" | "github";
  /** Alternate plugin names in installed_plugins.json (for name-divergent entries). */
  pluginIds?: string[];
}

export interface PluginCategory {
  id: string;
  name: string;
  icon: string;
}

// ─── Matching helper ─────────────────────────────────────────────────────────

/**
 * Check if a registry plugin entry matches any installed plugin name.
 * Uses the pluginIds field for explicit mappings, then falls back to
 * fuzzy matching on the id.
 */
function isPluginInstalled(
  entry: PluginEntry,
  installedNames: Set<string>,
): boolean {
  // Explicit mapping via pluginIds
  if (entry.pluginIds) {
    for (const pid of entry.pluginIds) {
      if (installedNames.has(pid)) return true;
    }
  }

  // Direct id match
  if (installedNames.has(entry.id)) return true;

  // Check if any installed name matches the registry id
  for (const name of installedNames) {
    // "superpowers" matches "superpowers"
    if (name === entry.id) return true;
    // "ralph-loop" contains "ralph"
    if (name.includes(entry.id) || entry.id.includes(name)) return true;
  }

  return false;
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface DiscoverStore {
  /** Full plugin list loaded from the registry JSON. */
  plugins: PluginEntry[];
  /** IDs of plugins the user triggered install for in this session (fallback). */
  installedIds: Set<string>;
  /** Plugin names actually installed on disk (from installed_plugins.json). */
  installedPluginNames: Set<string>;
  /** Full installed plugin data from disk (for "Installed" tab showing ALL plugins). */
  installedPluginData: Array<{
    key: string;
    name: string;
    marketplace: string;
    enabled: boolean;
    version: string;
  }>;
  /** Whether the Discover panel overlay is visible. */
  discoverOpen: boolean;
  /** Current value of the search input. */
  searchQuery: string;
  /** Active category filter — "all" shows every plugin, "essentials" shows must-haves. */
  activeCategory: string;
  /** Whether GitHub discovery fetch is in progress. */
  discovering: boolean;

  setPlugins: (plugins: PluginEntry[]) => void;
  markInstalled: (id: string) => void;
  setInstalledPluginNames: (names: string[]) => void;
  setInstalledPluginData: (
    data: Array<{
      key: string;
      name: string;
      marketplace: string;
      enabled: boolean;
      version: string;
    }>,
  ) => void;
  setDiscoverOpen: (open: boolean) => void;
  toggleDiscover: () => void;
  setSearchQuery: (query: string) => void;
  setActiveCategory: (cat: string) => void;
  setDiscovering: (discovering: boolean) => void;
  /** Check if a plugin entry is installed (real or session-level). */
  isInstalled: (entry: PluginEntry) => boolean;
  /** Returns plugins filtered by the current search query and active category. */
  getFiltered: () => PluginEntry[];
  /** Returns only essential plugins. */
  getEssentials: () => PluginEntry[];
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useDiscoverStore = create<DiscoverStore>()(
  persist(
    (set, get) => ({
      plugins: [],
      installedIds: new Set<string>(),
      installedPluginNames: new Set<string>(),
      installedPluginData: [],
      discoverOpen: false,
      searchQuery: "",
      activeCategory: "all",
      discovering: false,

      setPlugins: (plugins) => set({ plugins }),

      markInstalled: (id) =>
        set((state) => {
          const next = new Set(state.installedIds);
          next.add(id);
          return { installedIds: next };
        }),

      setInstalledPluginNames: (names) =>
        set({ installedPluginNames: new Set(names) }),

      setInstalledPluginData: (data) => set({ installedPluginData: data }),

      setDiscoverOpen: (open) => set({ discoverOpen: open }),

      toggleDiscover: () => set((s) => ({ discoverOpen: !s.discoverOpen })),

      setSearchQuery: (query) => set({ searchQuery: query }),

      setActiveCategory: (cat) => set({ activeCategory: cat }),

      setDiscovering: (discovering) => set({ discovering }),

      isInstalled: (entry) => {
        const { installedIds, installedPluginNames } = get();
        // Session-level install tracking
        if (installedIds.has(entry.id)) return true;
        // Real installed state from disk
        return isPluginInstalled(entry, installedPluginNames);
      },

      getFiltered: () => {
        const {
          plugins,
          searchQuery,
          activeCategory,
          installedIds,
          installedPluginNames,
          installedPluginData,
        } = get();
        const q = searchQuery.trim().toLowerCase();

        if (activeCategory === "installed") {
          // For "Installed" tab: show ALL installed plugins, including ones not in registry
          // First get registry plugins that are installed
          const registryMatches = plugins.filter((p) => {
            return (
              installedIds.has(p.id) ||
              isPluginInstalled(p, installedPluginNames)
            );
          });

          // Then add installed plugins NOT in the registry
          const registryNames = new Set(registryMatches.map((p) => p.id));
          const extraPlugins: PluginEntry[] = installedPluginData
            .filter((ip) => {
              // Skip if already matched by a registry entry
              for (const rp of registryMatches) {
                if (rp.id === ip.name) return false;
                if (rp.pluginIds?.includes(ip.name)) return false;
                if (ip.name.includes(rp.id) || rp.id.includes(ip.name))
                  return false;
              }
              return true;
            })
            .map((ip) => ({
              id: ip.key,
              name: ip.name
                .replace(/[-_]/g, " ")
                .replace(/\b\w/g, (c) => c.toUpperCase()),
              description: `Installed from ${ip.marketplace}`,
              category: "toolkit",
              stars: 0,
              repo: ip.marketplace,
              installCommand: `claude plugin install ${ip.key}`,
              tags: [ip.marketplace],
              essential: false,
              source: "bundled" as const,
            }));

          const all = [...registryMatches, ...extraPlugins];

          if (q === "") return all;
          return all.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              p.description.toLowerCase().includes(q) ||
              p.tags.some((t) => t.toLowerCase().includes(q)),
          );
        }

        return plugins.filter((p) => {
          // Virtual categories
          if (activeCategory === "essentials") {
            if (!p.essential) return false;
          } else {
            const categoryMatch =
              activeCategory === "all" || p.category === activeCategory;
            if (!categoryMatch) return false;
          }

          if (q === "") return true;

          return (
            p.name.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            p.tags.some((t) => t.toLowerCase().includes(q))
          );
        });
      },

      getEssentials: () => {
        return get().plugins.filter((p) => p.essential);
      },
    }),
    {
      name: "gilfoyle:discover",
      // Persist only session-installed IDs and the last active category.
      partialize: (state) => ({
        installedIds: Array.from(state.installedIds),
        activeCategory: state.activeCategory,
      }),
      // Re-hydrate the Set from the persisted plain array.
      merge: (persisted, current) => {
        const p = persisted as {
          installedIds?: string[];
          activeCategory?: string;
        };
        return {
          ...current,
          installedIds: new Set<string>(p.installedIds ?? []),
          activeCategory: p.activeCategory ?? "all",
        };
      },
    },
  ),
);
