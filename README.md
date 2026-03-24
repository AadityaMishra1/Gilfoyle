# Gilfoyle

**A desktop GUI for Claude Code CLI — warm dark terminal dashboard.**

<!-- Screenshots coming soon -->

---

## Features

### Terminal & Sessions

- **Full PTY terminal** — wraps the real `claude` CLI process with 100% capability preservation. This is not an API wrapper; it spawns and manages the actual Claude Code process via node-pty.
- **Multi-tab sessions** — open multiple terminal tabs per project, name sessions, and switch between them instantly.
- **Session resume** — continue previous sessions with `--continue` / `--resume` flags.

### Project Management

- **Project discovery** — automatically discovers and lists projects from `~/.claude/projects/`.
- **File browser** — hierarchical tree view with code preview, syntax highlighting via CodeMirror 6, and "touched files" highlighting for Claude-modified files.
- **Git integration** — branch tracking, diff viewer, and commit history.

### Monitoring & Analytics

- **Activity feed** — real-time tracking of file operations, git commits, tests, shell commands, agent spawns, errors, and more (9 event types with color-coded icons).
- **MCP server monitoring** — live status indicators (connected / needs-auth / error / disconnected) with tool counts for each server.
- **Usage tracking** — OAuth-based real usage data (macOS), PTY `/usage` parsing, and message count estimation fallback.
- **Dual billing modes** — Subscription mode (usage percentages with reset timers) vs API mode (token costs in USD with 7-day charts).
- **Analytics dashboard** — Bloomberg-terminal style layout with session stats, rate health indicators, and cost breakdowns.

### Discovery & Extensibility

- **Plugin marketplace** — curated plugin registry plus GitHub discovery, with one-click install.
- **Command palette** — `Cmd/Ctrl+K` for quick actions across the entire app.
- **Settings** — dark/light theme, billing mode, plan tier (Pro/Max), terminal font size, and more.

### User Experience

- **Onboarding wizard** — 4-step guided setup with layout selection.
- **Layout modes** — Simple (terminal only) vs Power (multi-panel dashboard with activity, files, tools, analytics).
- **Design system** — warm dark theme (stone `#1c1917` + peach `#e8a872` accent), Geist Mono for code, Inter for UI.
- **Keyboard shortcuts** — `Cmd/Ctrl+K` (palette), `Cmd/Ctrl+N` (new session), `Cmd/Ctrl+\` (sidebar), `Cmd/Ctrl+Shift+P` (switch layout).

### Cross-Platform

- **macOS** — universal binary (Intel + Apple Silicon)
- **Windows** — x64 installer (NSIS)
- **Linux** — x64 AppImage and `.deb`

---

## Prerequisites

- **Claude Code CLI** — install with `npm i -g @anthropic-ai/claude-code`
- **A Claude account** — Pro, Max, Teams, or API

---

## Install

Download the latest release for your platform from [GitHub Releases](https://github.com/AadityaMishra1/Gilfoyle/releases).

| Platform | Format |
|----------|--------|
| macOS | `.dmg` (universal — Intel + Apple Silicon) |
| Windows | `.exe` installer (NSIS, x64) |
| Linux | `.AppImage` or `.deb` (x64) |

---

## Build from Source

```bash
git clone https://github.com/AadityaMishra1/Gilfoyle.git
cd Gilfoyle
npm install
npm run build
npm run package:mac   # or package:win or package:linux
```

**Prerequisites:** Node.js 20+, npm, Python 3 (for node-pty native build), C++ build tools.

---

## Development

```bash
npm run dev          # electron-vite dev server with HMR
npm run build        # production build to out/
npm test             # vitest
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Electron 33 + electron-vite 2 |
| Renderer | React 18 + TypeScript + Tailwind CSS 3 |
| Terminal | xterm.js 6 + node-pty (native addon) |
| State | Zustand 5 (7 stores) |
| Icons | lucide-react |
| Command palette | cmdk |
| Code editor | CodeMirror 6 |

---

## Architecture

```
src/
  main/              Electron main process (Node.js)
    index.ts          BrowserWindow, app lifecycle
    ipc/              IPC handlers (session, analytics, MCP, projects)
    pty/              PTY spawning via node-pty
    parsers/          JSONL parser, event classifier, cost calculator
    services/         Session index, cost aggregator, MCP status, usage tracker
    watchers/         File watchers for ~/.claude/ and project CWD

  preload/            Context bridge — exposes window.claude API
    index.ts

  renderer/           React app
    App.tsx            Root layout: TitleBar + Sidebar + ProjectView + StatusBar
    components/        UI components (terminal, activity, files, tools, usage, etc.)
    stores/            Zustand stores (project, session, analytics, layout, ui, mcp, etc.)
    hooks/             Custom React hooks (use-ipc, use-terminal, use-session, etc.)

  shared/             Shared between main + renderer
    ipc-channels.ts   IPC channel constants and types
    types/            TypeScript type definitions
    pricing.ts        Model pricing tables
    utils/            Path decoder, formatters
```

---

## Account Compatibility

Gilfoyle works with all Claude account types:

- **Claude Pro / Max / Teams** — subscription usage tracking with reset timers
- **Claude API** — token cost tracking in USD with historical charts
- **Free tier** — basic session management

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on reporting bugs, suggesting features, and submitting pull requests.

---

## License

MIT — see [LICENSE](LICENSE) for details.
