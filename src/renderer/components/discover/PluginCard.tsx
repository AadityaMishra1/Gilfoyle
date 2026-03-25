/**
 * PluginCard — Compact card for a single plugin in the Discover grid.
 *
 * Layout:
 *   Top:    Name (stone-100, 13px, semibold) + category pill (right-aligned)
 *   Middle: Description (stone-400, 11px, 2-line clamp)
 *   Bottom: Star count badge + "View Repo" button
 */

import React, { useCallback } from "react";
import { Star, ExternalLink, BadgeCheck } from "lucide-react";
import type { PluginEntry } from "../../stores/discover-store";
import { useDiscoverStore } from "../../stores/discover-store";

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

// ─── View Repo button ────────────────────────────────────────────────────────

interface ViewRepoButtonProps {
  repo: string;
}

const ViewRepoButton: React.FC<ViewRepoButtonProps> = ({ repo }) => {
  const handleClick = useCallback(() => {
    const url = repo.startsWith("http") ? repo : `https://github.com/${repo}`;
    window.open(url, "_blank");
  }, [repo]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium
        bg-[#e8a872]/15 text-[#e8a872] ring-1 ring-[#e8a872]/30
        hover:bg-[#e8a872]/25 hover:ring-[#e8a872]/50
        active:bg-[#e8a872]/20 transition-colors duration-100 shrink-0 cursor-pointer"
      style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
      title={`View on GitHub: ${repo}`}
    >
      <ExternalLink size={9} className="shrink-0" />
      View Repo
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
  return (
    <div
      className="flex flex-col gap-1.5 px-3 py-2.5 rounded-md border transition-colors duration-100
        bg-stone-900 border-stone-800 hover:border-stone-700"
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
        <ViewRepoButton repo={plugin.repo} />
      </div>
    </div>
  );
};

export default PluginCard;
