import React, { useEffect, useState, useCallback } from "react";
import {
  GitBranch,
  GitCommit,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { formatRelativeTime } from "../../../shared/utils/format";
import DiffViewer from "../shared/DiffViewer";
import type { FileDiff } from "../../stores/file-store";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GitChange {
  status: string;
  file: string;
  additions?: number;
  deletions?: number;
}

interface GitCommitEntry {
  hash: string;
  message: string;
  timestamp: number;
}

interface GitStatus {
  branch: string;
  commits: GitCommitEntry[];
  changes: GitChange[];
}

interface GitPanelProps {
  projectPath?: string;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function statusLabel(status: string): string {
  if (status.includes("M")) return "Modified";
  if (status.includes("A")) return "Added";
  if (status.includes("D")) return "Deleted";
  if (status.includes("R")) return "Renamed";
  if (status.includes("C")) return "Copied";
  if (status.includes("?")) return "Untracked";
  if (status.includes("U")) return "Conflicted";
  return status.trim() || "Unknown";
}

function statusColor(status: string): string {
  if (status.includes("M")) return "#60a5fa"; // blue
  if (status.includes("A")) return "#4ade80"; // green
  if (status.includes("D")) return "#f87171"; // red
  if (status.includes("R")) return "#c084fc"; // purple
  if (status.includes("?")) return "#a8a29e"; // stone
  if (status.includes("U")) return "#fbbf24"; // amber
  return "#a8a29e";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GitPanel({ projectPath }: GitPanelProps): React.ReactElement {
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [notARepo, setNotARepo] = useState(false);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState<FileDiff | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);

  const loadGitStatus = useCallback(async () => {
    if (!projectPath) return;
    setLoading(true);
    try {
      const result = await window.claude.getGitStatus(projectPath);
      if (result === null) {
        setNotARepo(true);
        setGitStatus(null);
      } else {
        setNotARepo(false);
        setGitStatus(result as GitStatus);
      }
    } catch {
      setNotARepo(true);
      setGitStatus(null);
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  // Load once on mount.
  useEffect(() => {
    setGitStatus(null);
    setNotARepo(false);
    setExpandedFile(null);
    setFileDiff(null);
    void loadGitStatus();
  }, [loadGitStatus]);

  // Refresh on file changes.
  useEffect(() => {
    const unsub = window.claude.onCwdFileChanged(() => {
      void loadGitStatus();
    });
    return unsub;
  }, [loadGitStatus]);

  const handleFileClick = useCallback(
    async (file: string) => {
      if (expandedFile === file) {
        setExpandedFile(null);
        setFileDiff(null);
        return;
      }
      setExpandedFile(file);
      setLoadingDiff(true);
      try {
        const diff = await window.claude.getGitDiff(projectPath ?? "", file);
        if (diff) {
          setFileDiff(diff as FileDiff);
        } else {
          setFileDiff(null);
        }
      } catch {
        setFileDiff(null);
      } finally {
        setLoadingDiff(false);
      }
    },
    [expandedFile, projectPath],
  );

  if (notARepo) {
    return (
      <div className="flex items-center justify-center h-full text-stone-600 text-[12px] select-none">
        Not a git repository
      </div>
    );
  }

  if (loading && !gitStatus) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-4 h-4 rounded-full border border-stone-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!gitStatus) {
    return (
      <div className="flex items-center justify-center h-full text-stone-600 text-[12px] select-none">
        No git data
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Branch header */}
      <div
        className="flex items-center gap-2 px-3 shrink-0 bg-stone-900 border-b border-stone-800"
        style={{ height: 28 }}
      >
        <GitBranch size={12} className="text-amber-500 shrink-0" />
        <span
          className="text-stone-200 font-medium truncate"
          style={{ fontSize: 11 }}
        >
          {gitStatus.branch}
        </span>
        <div className="flex-1" />
        {gitStatus.changes.length > 0 && (
          <span
            className="text-stone-500 shrink-0"
            style={{ fontSize: 10, fontFamily: "'Geist Mono', monospace" }}
          >
            {gitStatus.changes.length} changed
          </span>
        )}
        <button
          type="button"
          onClick={() => void loadGitStatus()}
          className="text-stone-600 hover:text-stone-400 transition-colors shrink-0"
          title="Refresh git status"
          aria-label="Refresh git"
        >
          <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* Working tree changes */}
        {gitStatus.changes.length > 0 && (
          <div className="border-b border-stone-800/50">
            <div
              className="px-3 py-1.5 text-stone-500 uppercase tracking-widest"
              style={{ fontSize: 9, fontFamily: "'Geist Mono', monospace" }}
            >
              Changes
            </div>
            {gitStatus.changes.map((change, i) => (
              <div key={i}>
                <button
                  type="button"
                  onClick={() => void handleFileClick(change.file)}
                  className="w-full flex items-center gap-2 px-3 h-8 min-w-0 hover:bg-stone-800/50 text-left transition-colors"
                >
                  {expandedFile === change.file ? (
                    <ChevronDown
                      size={10}
                      className="text-stone-600 shrink-0"
                    />
                  ) : (
                    <ChevronRight
                      size={10}
                      className="text-stone-600 shrink-0"
                    />
                  )}

                  {/* Status label */}
                  <span
                    className="shrink-0 rounded px-1 font-mono font-medium"
                    style={{
                      fontSize: 9,
                      color: statusColor(change.status),
                      backgroundColor: `${statusColor(change.status)}15`,
                    }}
                  >
                    {statusLabel(change.status)}
                  </span>

                  {/* Filename */}
                  <span
                    className="flex-1 min-w-0 text-stone-300 truncate"
                    style={{ fontSize: 11 }}
                    title={change.file}
                  >
                    {change.file}
                  </span>

                  {/* +/- counts */}
                  {(change.additions !== undefined ||
                    change.deletions !== undefined) && (
                    <span
                      className="shrink-0 font-mono"
                      style={{ fontSize: 9 }}
                    >
                      {change.additions !== undefined &&
                        change.additions > 0 && (
                          <span className="text-green-500">
                            +{change.additions}
                          </span>
                        )}
                      {change.deletions !== undefined &&
                        change.deletions > 0 && (
                          <span className="text-red-500 ml-1">
                            -{change.deletions}
                          </span>
                        )}
                    </span>
                  )}
                </button>

                {/* Inline diff (accordion) */}
                {expandedFile === change.file && (
                  <div
                    className="border-t border-b border-stone-800/30"
                    style={{ maxHeight: 300, overflow: "auto" }}
                  >
                    {loadingDiff ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="w-3 h-3 rounded-full border border-stone-600 border-t-transparent animate-spin" />
                      </div>
                    ) : fileDiff ? (
                      <DiffViewer diff={fileDiff} />
                    ) : (
                      <div className="py-3 text-center text-stone-600 text-[10px]">
                        No diff available
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Recent commits */}
        {gitStatus.commits.length > 0 && (
          <div>
            <div
              className="px-3 py-1.5 text-stone-500 uppercase tracking-widest"
              style={{ fontSize: 9, fontFamily: "'Geist Mono', monospace" }}
            >
              Recent commits
            </div>
            {gitStatus.commits.map((commit, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 h-8 min-w-0 hover:bg-stone-800/50"
              >
                <GitCommit size={11} className="text-stone-600 shrink-0" />
                <span
                  className="text-stone-500 font-mono shrink-0"
                  style={{ fontSize: 10 }}
                >
                  {commit.hash}
                </span>
                <span
                  className="flex-1 min-w-0 text-stone-300 truncate"
                  style={{ fontSize: 11 }}
                  title={commit.message}
                >
                  {commit.message}
                </span>
                <span
                  className="text-stone-600 font-mono shrink-0"
                  style={{ fontSize: 10 }}
                >
                  {formatRelativeTime(commit.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}

        {gitStatus.changes.length === 0 && gitStatus.commits.length === 0 && (
          <div className="flex items-center justify-center h-full text-stone-600 text-[12px] select-none">
            Clean working tree, no commits
          </div>
        )}
      </div>
    </div>
  );
}
