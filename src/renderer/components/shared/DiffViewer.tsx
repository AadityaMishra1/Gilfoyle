/**
 * DiffViewer — Side-by-side diff display using the `diff` package.
 *
 * Renders before/after content with per-line colouring:
 *   - Added lines:   green-900/20 background
 *   - Removed lines: red-900/20 background
 *   - Unchanged:     transparent
 *
 * When no diff is provided an empty-state placeholder is shown.
 */

import React, { useMemo } from "react";
import { diffLines, type Change } from "diff";
import { GitCompareArrows } from "lucide-react";
import type { FileDiff } from "../../stores/file-store";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineEntry {
  lineNo: number | null;
  content: string;
  kind: "added" | "removed" | "unchanged";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a diff Change array into two parallel line-entry arrays —
 * one for the "before" column and one for the "after" column.
 *
 * Removed lines appear only in `beforeLines`.
 * Added lines appear only in `afterLines`.
 * Unchanged lines appear in both at the same relative position.
 */
function buildColumns(changes: Change[]): {
  beforeLines: LineEntry[];
  afterLines: LineEntry[];
} {
  const beforeLines: LineEntry[] = [];
  const afterLines: LineEntry[] = [];

  let beforeNo = 1;
  let afterNo = 1;

  for (const change of changes) {
    const rawLines = change.value.split("\n");
    // `diff` always ends a block with a trailing newline that produces an
    // empty string at the end — drop it to avoid phantom blank rows.
    if (rawLines[rawLines.length - 1] === "") rawLines.pop();

    if (change.removed) {
      for (const line of rawLines) {
        beforeLines.push({
          lineNo: beforeNo++,
          content: line,
          kind: "removed",
        });
        afterLines.push({ lineNo: null, content: "", kind: "unchanged" });
      }
    } else if (change.added) {
      for (const line of rawLines) {
        beforeLines.push({ lineNo: null, content: "", kind: "unchanged" });
        afterLines.push({ lineNo: afterNo++, content: line, kind: "added" });
      }
    } else {
      for (const line of rawLines) {
        beforeLines.push({
          lineNo: beforeNo++,
          content: line,
          kind: "unchanged",
        });
        afterLines.push({
          lineNo: afterNo++,
          content: line,
          kind: "unchanged",
        });
      }
    }
  }

  return { beforeLines, afterLines };
}

function lineBackground(kind: LineEntry["kind"]): string {
  switch (kind) {
    case "added":
      return "bg-green-900/20";
    case "removed":
      return "bg-red-900/20";
    default:
      return "";
  }
}

function lineNumberColor(kind: LineEntry["kind"]): string {
  switch (kind) {
    case "added":
      return "text-green-600";
    case "removed":
      return "text-red-600";
    default:
      return "text-zinc-700";
  }
}

function lineTextColor(kind: LineEntry["kind"]): string {
  switch (kind) {
    case "added":
      return "text-green-300";
    case "removed":
      return "text-red-300";
    default:
      return "text-zinc-300";
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface DiffColumnProps {
  lines: LineEntry[];
  label: string;
}

const DiffColumn: React.FC<DiffColumnProps> = ({ lines, label }) => (
  <div className="flex-1 min-w-0 overflow-x-auto" aria-label={label}>
    <table className="w-full border-collapse" role="table">
      <tbody>
        {lines.map((line, idx) => (
          <tr key={idx} className={`${lineBackground(line.kind)} leading-5`}>
            {/* Line number gutter */}
            <td
              className={`select-none text-right pr-3 pl-2 w-10 shrink-0 tabular-nums align-top ${lineNumberColor(line.kind)}`}
              style={{
                fontSize: 11,
                fontFamily: "'Geist Mono', monospace",
                minWidth: 40,
              }}
            >
              {line.lineNo !== null ? line.lineNo : ""}
            </td>
            {/* Line content */}
            <td
              className={`whitespace-pre pr-4 align-top ${lineTextColor(line.kind)}`}
              style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace" }}
            >
              {line.content}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

interface DiffViewerProps {
  diff: FileDiff | null;
}

const DiffViewer: React.FC<DiffViewerProps> = ({ diff }) => {
  const columns = useMemo(() => {
    if (diff === null) return null;
    const changes = diffLines(diff.before, diff.after);
    return buildColumns(changes);
  }, [diff]);

  // ── Empty state ────────────────────────────────────────────────────────────
  if (diff === null || columns === null) {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 shrink-0">
          <GitCompareArrows size={13} className="text-zinc-600 shrink-0" />
          <span
            className="text-zinc-600 text-xs"
            style={{ fontFamily: "'Geist Mono', monospace" }}
          >
            Diff viewer
          </span>
        </div>
        {/* Body */}
        <div className="flex-1 flex items-center justify-center">
          <span
            className="text-zinc-700 text-xs"
            style={{ fontFamily: "'Geist Mono', monospace" }}
          >
            Select a modified file to view its diff
          </span>
        </div>
      </div>
    );
  }

  const { beforeLines, afterLines } = columns;
  const basename = diff.filePath.split("/").pop() ?? diff.filePath;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 shrink-0 min-w-0">
        <GitCompareArrows size={13} className="text-amber-500 shrink-0" />
        <span
          className="text-zinc-300 text-xs truncate"
          style={{ fontFamily: "'Geist Mono', monospace" }}
          title={diff.filePath}
        >
          {basename}
        </span>
        <span
          className="ml-auto shrink-0 text-zinc-600 text-xs tabular-nums"
          style={{ fontFamily: "'Geist Mono', monospace" }}
        >
          {diff.filePath}
        </span>
      </div>

      {/* Column labels */}
      <div className="flex border-b border-zinc-800/60 shrink-0">
        <div
          className="flex-1 px-3 py-0.5 text-zinc-600 text-xs border-r border-zinc-800/60"
          style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10 }}
        >
          Before
        </div>
        <div
          className="flex-1 px-3 py-0.5 text-zinc-600 text-xs"
          style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10 }}
        >
          After
        </div>
      </div>

      {/* Diff columns — scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="flex min-h-full divide-x divide-zinc-800/60">
          <DiffColumn lines={beforeLines} label="Before" />
          <DiffColumn lines={afterLines} label="After" />
        </div>
      </div>
    </div>
  );
};

export default DiffViewer;
