/**
 * TreeView — Generic recursive file-tree component.
 *
 * Renders a nested FileEntry array with expand/collapse for directories,
 * extension-based file icons from lucide-react, and amber highlighting for
 * files Claude has modified in the current session.
 */

import React, { useCallback } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode,
  FileJson,
  FileText,
} from 'lucide-react'
import type { FileEntry } from '../../stores/file-store'

// ─── Icon helpers ─────────────────────────────────────────────────────────────

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte'])
const JSON_EXTENSIONS = new Set(['.json', '.jsonc', '.jsonl'])

function getFileIcon(name: string): React.ReactNode {
  const dot = name.lastIndexOf('.')
  const ext = dot !== -1 ? name.slice(dot).toLowerCase() : ''

  if (CODE_EXTENSIONS.has(ext)) {
    return <FileCode size={13} className="shrink-0 text-amber-400/70" />
  }
  if (JSON_EXTENSIONS.has(ext)) {
    return <FileJson size={13} className="shrink-0 text-yellow-500/70" />
  }
  return <FileText size={13} className="shrink-0 text-zinc-500" />
}

// ─── TreeNode ─────────────────────────────────────────────────────────────────

interface TreeNodeProps {
  entry: FileEntry
  depth: number
  expandedPaths: Set<string>
  selectedFile: string | null
  touchedFiles: Set<string>
  onToggleExpand: (path: string) => void
  onSelectFile: (path: string) => void
}

const TreeNode: React.FC<TreeNodeProps> = ({
  entry,
  depth,
  expandedPaths,
  selectedFile,
  touchedFiles,
  onToggleExpand,
  onSelectFile,
}) => {
  const isExpanded = expandedPaths.has(entry.path)
  const isSelected = selectedFile === entry.path
  const isTouched = touchedFiles.has(entry.path)

  const handleClick = useCallback(() => {
    if (entry.isDirectory) {
      onToggleExpand(entry.path)
    } else {
      onSelectFile(entry.path)
    }
  }, [entry.isDirectory, entry.path, onToggleExpand, onSelectFile])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleClick()
      }
    },
    [handleClick],
  )

  // Build row background — selected takes priority over touched.
  let rowBg = 'hover:bg-zinc-800/60'
  if (isSelected) {
    rowBg = 'bg-amber-500/15 hover:bg-amber-500/20'
  } else if (isTouched) {
    rowBg = 'bg-amber-900/10 hover:bg-amber-900/20'
  }

  return (
    <div role="treeitem" aria-selected={isSelected} aria-expanded={entry.isDirectory ? isExpanded : undefined}>
      {/* Row */}
      <div
        className={`flex items-center gap-1.5 py-0.5 cursor-pointer select-none rounded-sm ${rowBg} transition-colors duration-75`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        aria-label={entry.name}
      >
        {/* Chevron for directories */}
        {entry.isDirectory ? (
          <span className="text-zinc-500 shrink-0" aria-hidden="true">
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        ) : (
          // Spacer to keep file names aligned with directory children.
          <span className="shrink-0" style={{ width: 12 }} aria-hidden="true" />
        )}

        {/* Icon */}
        <span aria-hidden="true">
          {entry.isDirectory ? (
            isExpanded ? (
              <FolderOpen size={13} className="shrink-0 text-amber-400/80" />
            ) : (
              <Folder size={13} className="shrink-0 text-zinc-400/70" />
            )
          ) : (
            getFileIcon(entry.name)
          )}
        </span>

        {/* Name */}
        <span
          className={`text-xs truncate ${
            isSelected
              ? 'text-amber-300 font-medium'
              : isTouched
                ? 'text-amber-400/90'
                : 'text-zinc-400'
          }`}
          style={{ fontFamily: "'Geist Mono', monospace" }}
          title={entry.path}
        >
          {entry.name}
        </span>

        {/* Touched badge */}
        {isTouched && !entry.isDirectory && (
          <span
            className="ml-auto mr-2 shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400"
            title="Modified by Claude"
            aria-label="Modified by Claude"
          />
        )}
      </div>

      {/* Children — rendered only when expanded */}
      {entry.isDirectory && isExpanded && entry.children !== undefined && entry.children.length > 0 && (
        <div role="group">
          {entry.children.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              selectedFile={selectedFile}
              touchedFiles={touchedFiles}
              onToggleExpand={onToggleExpand}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}

      {/* Empty directory placeholder */}
      {entry.isDirectory && isExpanded && (entry.children === undefined || entry.children.length === 0) && (
        <div
          className="text-zinc-700 text-xs py-0.5"
          style={{ paddingLeft: 8 + (depth + 1) * 16, fontFamily: "'Geist Mono', monospace" }}
        >
          empty
        </div>
      )}
    </div>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

export interface TreeViewProps {
  entries: FileEntry[]
  expandedPaths: Set<string>
  selectedFile: string | null
  touchedFiles: Set<string>
  onToggleExpand: (path: string) => void
  onSelectFile: (path: string) => void
}

const TreeView: React.FC<TreeViewProps> = ({
  entries,
  expandedPaths,
  selectedFile,
  touchedFiles,
  onToggleExpand,
  onSelectFile,
}) => {
  if (entries.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-24 text-zinc-600 text-xs"
        style={{ fontFamily: "'Geist Mono', monospace" }}
      >
        No files
      </div>
    )
  }

  return (
    <div role="tree" aria-label="File tree" className="py-1">
      {entries.map((entry) => (
        <TreeNode
          key={entry.path}
          entry={entry}
          depth={0}
          expandedPaths={expandedPaths}
          selectedFile={selectedFile}
          touchedFiles={touchedFiles}
          onToggleExpand={onToggleExpand}
          onSelectFile={onSelectFile}
        />
      ))}
    </div>
  )
}

export default TreeView
