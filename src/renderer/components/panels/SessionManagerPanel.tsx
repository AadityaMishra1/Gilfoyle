import React, { useState, useMemo, useCallback } from "react";
import {
  Search,
  Trash2,
  GitBranch,
  Terminal,
  Play,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useSessionStore } from "../../stores/session-store";
import {
  formatRelativeTime,
  formatTokenCount,
} from "../../../shared/utils/format";
import { shortenPath } from "../../../shared/utils/path-decoder";
import { getModelDisplayName } from "../../../shared/pricing";
import type { SessionMeta } from "../../../shared/types/session";

// ─── Helpers ──────────────────────────────────────────────────────────────

function groupByProject(sessions: SessionMeta[]): Map<string, SessionMeta[]> {
  const map = new Map<string, SessionMeta[]>();
  for (const session of sessions) {
    const key = session.cwd;
    const bucket = map.get(key);
    if (bucket !== undefined) {
      bucket.push(session);
    } else {
      map.set(key, [session]);
    }
  }
  return map;
}

function matchesQuery(session: SessionMeta, query: string): boolean {
  if (query.length === 0) return true;
  const q = query.toLowerCase();
  return (
    session.name.toLowerCase().includes(q) ||
    session.sessionId.toLowerCase().includes(q) ||
    session.cwd.toLowerCase().includes(q) ||
    (session.model?.toLowerCase().includes(q) ?? false) ||
    (session.gitBranch?.toLowerCase().includes(q) ?? false)
  );
}

/**
 * Derive a compact model label like "opus", "sonnet", "haiku" from the full
 * model slug, and pick the appropriate colour classes.
 */
function resolveModelBadge(model: string): {
  label: string;
  colourClass: string;
} {
  if (model.includes("opus")) {
    return {
      label: "opus",
      colourClass: "bg-amber-900/50 text-amber-300 ring-amber-700/40",
    };
  }
  if (model.includes("sonnet")) {
    return {
      label: "sonnet",
      colourClass: "bg-sky-900/50 text-sky-300 ring-sky-700/40",
    };
  }
  if (model.includes("haiku")) {
    return {
      label: "haiku",
      colourClass: "bg-emerald-900/50 text-emerald-300 ring-emerald-700/40",
    };
  }
  const display = getModelDisplayName(model);
  return {
    label: display,
    colourClass: "bg-zinc-800 text-zinc-400 ring-zinc-700/40",
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────

interface ModelBadgeProps {
  model: string | undefined;
}

const ModelBadge: React.FC<ModelBadgeProps> = ({ model }) => {
  if (model === undefined) return null;
  const { label, colourClass } = resolveModelBadge(model);
  return (
    <span
      className={`inline-flex items-center px-1.5 py-px rounded text-[9px] font-semibold leading-none uppercase tracking-wide ring-1 ${colourClass}`}
    >
      {label}
    </span>
  );
};

// ─── Session card ─────────────────────────────────────────────────────────

interface SessionCardProps {
  session: SessionMeta;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onResume: (id: string, cwd: string) => void;
}

const SessionCard: React.FC<SessionCardProps> = ({
  session,
  isActive,
  onSelect,
  onDelete,
  onResume,
}) => {
  const totalTokens = session.totalInputTokens + session.totalOutputTokens;
  const shortId = session.sessionId.slice(0, 8);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(session.sessionId);
      }
    },
    [onSelect, session.sessionId],
  );

  const handleResumeClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onResume(session.sessionId, session.cwd);
    },
    [onResume, session.sessionId, session.cwd],
  );

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete(session.sessionId);
    },
    [onDelete, session.sessionId],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      onClick={() => onSelect(session.sessionId)}
      onKeyDown={handleKeyDown}
      className={[
        // Base layout — fixed ~44px height via py-2.5 + content constraints
        "group relative flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none",
        "transition-colors duration-100",
        // Active-session: amber left border + faint amber tint
        isActive
          ? "border-l-2 border-l-amber-500 bg-amber-500/5 pl-[10px]"
          : "border-l-2 border-l-transparent hover:bg-zinc-800 pl-[10px]",
      ].join(" ")}
    >
      {/* Running indicator — 6px green dot */}
      {session.isActive && (
        <span
          aria-label="Session running"
          className="relative flex shrink-0 h-1.5 w-1.5"
        >
          <span
            className="inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"
            style={{ boxShadow: "0 0 4px 1px rgba(52,211,153,0.4)" }}
          />
        </span>
      )}

      {/* Left content block */}
      <div className="flex flex-col min-w-0 flex-1 gap-0.5">
        {/* Top row: name + model badge + short ID */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={[
              "truncate text-xs font-semibold leading-tight",
              isActive ? "text-amber-200" : "text-zinc-200",
            ].join(" ")}
            title={session.name}
          >
            {session.name}
          </span>

          <ModelBadge model={session.model} />

          {session.gitBranch !== undefined && (
            <span className="flex items-center gap-0.5 shrink-0 text-[10px] text-zinc-600 min-w-0 max-w-[80px]">
              <GitBranch size={9} className="shrink-0" />
              <span className="truncate">{session.gitBranch}</span>
            </span>
          )}
        </div>

        {/* Bottom row: session short ID */}
        <span
          className="text-[10px] text-zinc-500 leading-none truncate"
          style={{ fontFamily: "'Geist Mono', 'Fira Code', monospace" }}
        >
          {shortId}
        </span>
      </div>

      {/* Right content block */}
      <div className="flex flex-col items-end shrink-0 gap-0.5">
        {/* Relative time */}
        <span
          className="text-[10px] text-zinc-600 leading-tight"
          style={{ fontFamily: "'Geist Mono', 'Fira Code', monospace" }}
        >
          {formatRelativeTime(session.lastActiveAt)}
        </span>

        {/* Token count only — no dollar amounts for subscription users */}
        {totalTokens > 0 && (
          <span
            className="text-[10px] text-zinc-500 leading-tight tabular-nums"
            style={{ fontFamily: "'Geist Mono', 'Fira Code', monospace" }}
          >
            {formatTokenCount(totalTokens)} tokens
          </span>
        )}
      </div>

      {/* Hover actions — Resume + Delete */}
      <div
        className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5
          opacity-0 group-hover:opacity-100 transition-opacity duration-100
          bg-zinc-900 pl-1"
      >
        <button
          type="button"
          aria-label="Resume session"
          title="Resume"
          onClick={handleResumeClick}
          className="p-1 rounded text-zinc-500 hover:text-amber-300 hover:bg-zinc-700/60 transition-colors"
        >
          <Play size={11} />
        </button>
        <button
          type="button"
          aria-label="Delete session"
          title="Delete"
          onClick={handleDeleteClick}
          className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-700/60 transition-colors"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
};

// ─── Project group ────────────────────────────────────────────────────────

interface ProjectGroupProps {
  cwd: string;
  sessions: SessionMeta[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onResume: (id: string, cwd: string) => void;
}

const ProjectGroup: React.FC<ProjectGroupProps> = ({
  cwd,
  sessions,
  activeSessionId,
  onSelect,
  onDelete,
  onResume,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  // Derive a tilde-prefixed display path without Node's os.homedir.
  const displayPath = useMemo(() => {
    const homePrefixPattern = /^\/(?:Users|home)\/[^/]+/;
    const match = cwd.match(homePrefixPattern);
    return match !== null ? shortenPath(cwd, match[0]) : cwd;
  }, [cwd]);

  // Just the last segment of the path — the folder name.
  const projectName =
    displayPath.split("/").filter(Boolean).pop() ?? displayPath;

  const toggleCollapsed = useCallback(() => setCollapsed((prev) => !prev), []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleCollapsed();
      }
    },
    [toggleCollapsed],
  );

  return (
    <div>
      {/* Group heading */}
      <button
        type="button"
        onClick={toggleCollapsed}
        onKeyDown={handleKeyDown}
        aria-expanded={!collapsed}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-zinc-800/40 transition-colors group/header"
      >
        <span className="text-zinc-600 shrink-0">
          {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
        </span>
        <GitBranch size={9} className="text-zinc-600 shrink-0" />
        <span
          className="text-[10px] font-medium text-zinc-500 group-hover/header:text-zinc-400 truncate transition-colors"
          title={cwd}
        >
          {projectName}
        </span>
        <span
          className="ml-auto text-[9px] text-zinc-700 tabular-nums shrink-0"
          style={{ fontFamily: "'Geist Mono', 'Fira Code', monospace" }}
        >
          {sessions.length}
        </span>
      </button>

      {/* Session cards */}
      {!collapsed && (
        <div>
          {sessions.map((session) => (
            <SessionCard
              key={session.sessionId}
              session={session}
              isActive={session.sessionId === activeSessionId}
              onSelect={onSelect}
              onDelete={onDelete}
              onResume={onResume}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Empty state ──────────────────────────────────────────────────────────

interface EmptyStateProps {
  isFiltered: boolean;
}

const EmptyState: React.FC<EmptyStateProps> = ({ isFiltered }) => (
  <div className="flex flex-col items-center justify-center h-32 gap-2.5 text-zinc-600 px-4">
    <Terminal size={20} className="opacity-30" />
    <span className="text-xs text-center leading-relaxed">
      {isFiltered ? "No sessions match your search" : "No sessions found"}
    </span>
  </div>
);

// ─── Main panel ───────────────────────────────────────────────────────────

interface SessionManagerPanelProps {
  /** Optional callback invoked when the user clicks a session. */
  onSessionSelect?: (sessionId: string) => void;
  /**
   * Called when the user presses Resume on a session card.
   * The host (App.tsx) should create a new PTY tab and send
   * `claude -r <claudeSessionId>` to resume that Claude session.
   */
  onResumeSession?: (claudeSessionId: string, cwd: string) => void;
}

const SessionManagerPanel: React.FC<SessionManagerPanelProps> = ({
  onSessionSelect,
  onResumeSession,
}) => {
  // Read directly from the Zustand store — populated by useDataLoader in App.
  const { sessions, activeSessionId, setActiveSession, removeSession } =
    useSessionStore();
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => sessions.filter((s) => matchesQuery(s, query)),
    [sessions, query],
  );

  const grouped = useMemo(() => groupByProject(filtered), [filtered]);

  const handleSelect = useCallback(
    (sessionId: string) => {
      const next = sessionId === activeSessionId ? null : sessionId;
      setActiveSession(next);
      if (next !== null) {
        onSessionSelect?.(next);
      }
    },
    [activeSessionId, setActiveSession, onSessionSelect],
  );

  const handleResume = useCallback(
    (sessionId: string, cwd: string) => {
      // Create a new PTY tab in the terminal panel and resume the Claude session.
      onResumeSession?.(sessionId, cwd);
      // Also mark this session as the active one in the sessions store.
      setActiveSession(sessionId);
    },
    [setActiveSession, onResumeSession],
  );

  const handleDelete = useCallback(
    (sessionId: string) => {
      removeSession(sessionId);
    },
    [removeSession],
  );

  return (
    <div className="flex flex-col h-full bg-zinc-900 text-zinc-200 overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2.5 border-b border-zinc-800/80 shrink-0">
        <div className="flex items-center gap-2 mb-2.5">
          <Terminal size={13} className="text-amber-400 shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Sessions
          </span>
          <span
            className="ml-auto text-[10px] text-zinc-700 tabular-nums"
            style={{ fontFamily: "'Geist Mono', 'Fira Code', monospace" }}
          >
            {sessions.length}
          </span>
        </div>

        {/* Minimal search bar */}
        <div className="relative">
          <Search
            size={11}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
          />
          <input
            type="text"
            placeholder="Filter sessions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={[
              "w-full pl-7 pr-3 py-1.5 rounded text-[11px]",
              "bg-zinc-800/60 border border-zinc-700/40",
              "text-zinc-300 placeholder-zinc-600",
              "focus:outline-none focus:ring-1 focus:ring-amber-500/40 focus:border-amber-500/40",
              "transition-colors",
            ].join(" ")}
          />
        </div>
      </div>

      {/* ── Session list ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overscroll-contain py-1">
        {grouped.size === 0 ? (
          <EmptyState isFiltered={query.length > 0} />
        ) : (
          Array.from(grouped.entries()).map(([cwd, projectSessions]) => (
            <ProjectGroup
              key={cwd}
              cwd={cwd}
              sessions={projectSessions}
              activeSessionId={activeSessionId}
              onSelect={handleSelect}
              onDelete={handleDelete}
              onResume={handleResume}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default SessionManagerPanel;
