import React, { useState } from 'react'
import {
  FilePlus,
  FileEdit,
  FileX,
  TestTube2,
  GitCommit,
  Terminal,
  Wrench,
  Bot,
  AlertCircle,
  LucideIcon,
} from 'lucide-react'
import { formatRelativeTime } from '../../../shared/utils/format'
import type { ActivityEvent, ActivityType } from '../../../shared/types/activity'

// ─── Icon registry ────────────────────────────────────────────────────────────

const ICONS: Record<string, LucideIcon> = {
  FilePlus,
  FileEdit,
  FileX,
  TestTube2,
  GitCommit,
  Terminal,
  Wrench,
  Bot,
  AlertCircle,
}

// ─── Border color by type ─────────────────────────────────────────────────────

const BORDER_COLORS: Record<ActivityType, string> = {
  file_create: '#3b82f6',  // blue-500
  file_edit: '#60a5fa',    // blue-400
  file_delete: '#ef4444',  // red-500
  test_run: '#22c55e',     // green-500
  git_op: '#f59e0b',       // amber-500
  shell_cmd: '#78716c',    // stone-500
  tool_call: '#78716c',    // stone-500
  agent_spawn: '#a78bfa',  // violet-400
  error: '#dc2626',        // red-600
}

const ICON_COLORS: Record<ActivityType, string> = {
  file_create: '#60a5fa',
  file_edit: '#93c5fd',
  file_delete: '#f87171',
  test_run: '#4ade80',
  git_op: '#fbbf24',
  shell_cmd: '#a8a29e',
  tool_call: '#a8a29e',
  agent_spawn: '#c4b5fd',
  error: '#f87171',
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ActivityItemProps {
  activity: ActivityEvent
}

export function ActivityItem({ activity }: ActivityItemProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false)

  const Icon = ICONS[activity.icon] ?? Wrench
  const borderColor = BORDER_COLORS[activity.type] ?? '#78716c'
  const iconColor = ICON_COLORS[activity.type] ?? '#a8a29e'
  const hasDetail = activity.detail !== undefined && activity.detail.length > 0

  function handleClick(): void {
    if (hasDetail) setExpanded((prev) => !prev)
  }

  return (
    <div
      role={hasDetail ? 'button' : undefined}
      tabIndex={hasDetail ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (hasDetail && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          setExpanded((prev) => !prev)
        }
      }}
      style={{ borderLeftColor: borderColor }}
      className={[
        'flex flex-col border-l-[3px] px-2 min-h-[36px] justify-center',
        'hover:bg-stone-800/50 transition-colors duration-100',
        hasDetail ? 'cursor-pointer' : 'cursor-default',
        'select-none',
      ].join(' ')}
    >
      {/* Main row */}
      <div className="flex items-center gap-1.5 h-9">
        <Icon size={14} color={iconColor} aria-hidden="true" className="shrink-0" />
        <span
          className="flex-1 text-stone-200 text-[12px] leading-none truncate"
          title={activity.summary}
        >
          {activity.summary}
        </span>
        <span className="text-stone-500 text-[11px] font-mono leading-none shrink-0 ml-1">
          {formatRelativeTime(activity.timestamp)}
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && activity.detail !== undefined && (
        <div className="pb-1.5 pt-0.5">
          <pre className="text-stone-400 text-[10px] font-mono whitespace-pre-wrap break-all leading-snug bg-stone-900/60 rounded px-2 py-1">
            {activity.detail}
          </pre>
        </div>
      )}
    </div>
  )
}
