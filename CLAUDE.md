# Gilfoyle

## What This Is

Electron desktop app wrapping Claude Code CLI via PTY. Project-centric layout with terminal tabs, activity feed, file browser, usage tracking, and plugin discovery. Not an API app — spawns the real `claude` process.

## Tech Stack

- **Framework**: Electron 33 + electron-vite 2
- **Renderer**: React 18 + TypeScript + Tailwind CSS 3
- **Terminal**: @xterm/xterm 6 + node-pty (native, loaded via `require()`)
- **State**: Zustand 5 (7 stores)
- **Icons**: lucide-react
- **Command palette**: cmdk
- **Charts**: recharts (used in legacy analytics, may be removed)

## Build & Run

```bash
npm install                    # postinstall rebuilds node-pty for Electron
npx electron-vite build        # builds main + preload + renderer to out/
npx electron-vite dev          # dev server with HMR
npm run package:mac            # builds DMG
```

## Important: Imports

- Use RELATIVE imports everywhere (e.g., `../../shared/pricing`), NOT path aliases (`@shared/pricing`)
- Path aliases don't resolve through electron-vite's `externalizeDepsPlugin`
- node-pty MUST use `require("node-pty")` not `import` — native .node addon can't be bundled by Vite

## Important: Build Output

- Output directory is `out/` not `dist/`
- `package.json` `"main"` points to `out/main/index.js`
- Always run `npx electron-vite build` to verify after changes
- If HMR seems stale, do `rm -rf out && npx electron-vite build`

## Architecture

```
src/
  main/                    # Electron main process (Node.js)
    index.ts               # BrowserWindow, app lifecycle
    ipc/handlers.ts        # ALL IPC handlers (session, analytics, MCP, projects, folders)
    pty/pty-manager.ts     # PTY spawning via node-pty (require, not import)
    parsers/               # JSONL parser, event classifier, cost calculator
    services/              # Session index, cost aggregator, MCP status, usage tracker, activity parser
    watchers/              # chokidar watchers for ~/.claude/ and CWD
    menu.ts                # Native macOS menu bar

  preload/index.ts         # contextBridge: window.claude API

  renderer/                # React app
    App.tsx                # Root layout: TitleBar + Sidebar + ProjectView + StatusBar
    components/
      layout/              # TitleBar, Sidebar, StatusBar, CommandPalette
      project/             # ProjectView (terminal + info tabs), InfoTabs
      terminal/            # TerminalArea, TerminalTabBar, SingleTerminal
      activity/            # ActivityFeed, ActivityItem
      discover/            # DiscoverPanel, PluginCard
      files/               # ProjectFiles
      tools/               # ToolsPanel, MCPSection, AgentSection, HooksSection
      usage/               # UsageMeter (title bar), UsageDetails (sidebar)
      onboarding/          # OnboardingOverlay
      shared/              # Button, Badge, Tooltip, TreeView, DiffViewer
    stores/                # Zustand: project, session, analytics, layout, ui, mcp, file, activity, usage, discover, settings
    hooks/                 # use-ipc, use-terminal, use-data-loader, use-session, use-shortcut

  shared/                  # Shared between main + renderer
    ipc-channels.ts        # ALL IPC channel constants + types
    types/                 # session, events, analytics, mcp, layout, activity
    pricing.ts             # Model pricing (subscription users: ignore costs)
    utils/                 # path-decoder, format
    data/plugin-registry.json  # Curated plugin index
```

## Design System

- **Palette**: Warm stone (#1c1917 primary, #171412 terminal, #292524 surface) + peach accent (#e8a872)
- **Font**: Inter/system-ui for UI, Geist Mono for data/terminal/code
- **Terminal theme**: Warm dark bg, peach cursor, warm ANSI colors
- **Sizing**: 11px dense data, 12px body, 10px labels, 24px status bar, 28px tab bars, 32px title bar + project rows

## Key IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| session:create | R→M | Spawn PTY |
| session:send-input | R→M | Write to PTY stdin |
| session:resize | R→M | Resize PTY cols/rows |
| pty:data | M→R | PTY output (push) |
| pty:exit | M→R | PTY exited (push) |
| projects:get | R→M | List projects from ~/.claude/projects/ |
| sessions:scan | R→M | Scan session JSONL files |
| analytics:get | R→M | Get cost summaries |
| mcp:get-status | R→M | Get MCP server statuses |
| dialog:open-folder | R→M | Native folder picker |
| activities:get | R→M | Get parsed activity events |
| usage:get | R→M | Get subscription usage stats |

## Rules

- Terminal MUST preserve 100% of Claude Code capabilities — never intercept, filter, or modify PTY I/O
- Don't show API dollar costs to subscription users — most users are on Claude Max
- Usage data should be honest — only show what we can accurately track (sessions, tokens, model)
- Don't show fake percentages or "messages left" estimates — Claude doesn't expose plan quotas
- Every panel must handle empty/undefined data gracefully with helpful empty states
- Test that the app actually works after changes — build and verify visually
