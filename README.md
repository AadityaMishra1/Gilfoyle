# Gilfoyle

A desktop GUI for Claude Code CLI.

<!-- Screenshots coming soon -->

## Features

- **Full PTY terminal** — wraps the real `claude` process. Not an API wrapper. Every Claude Code feature works.
- **Multi-tab sessions** — multiple terminals per project, session resume with `--continue` / `--resume`
- **Project discovery** — auto-detects projects from `~/.claude/projects/`
- **Activity feed** — real-time tracking of file edits, git ops, tests, shell commands, agent spawns, errors
- **File browser** — tree view with code preview and highlighting for Claude-modified files
- **MCP monitoring** — live server status with tool counts
- **Plugin marketplace** — curated registry + GitHub discovery, one-click install
- **Usage tracking** — subscription usage percentages or API token costs in USD
- **Analytics dashboard** — session stats, rate health, 7-day cost charts
- **Command palette** — `Cmd/Ctrl+K`
- **Two layouts** — Simple (terminal only) or Power (multi-panel dashboard)
- **Dark/light theme** — warm dark default with stone + peach accent
- **Cross-platform** — macOS, Windows, Linux

## Install

Download from [GitHub Releases](https://github.com/AadityaMishra1/Gilfoyle/releases):

| Platform | Format |
|----------|--------|
| macOS | `.dmg` (universal) |
| Windows | `.exe` installer |
| Linux | `.AppImage` or `.deb` |

### macOS: first launch

macOS will show "cannot verify the developer" on first open. To bypass this:

1. **Right-click** (or Control-click) the app in Finder
2. Click **Open**
3. Click **Open** again in the dialog

You only need to do this once. Alternatively, run:
```bash
xattr -cr /Applications/Gilfoyle.app
```

### Prerequisites

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) — `npm i -g @anthropic-ai/claude-code`
- A Claude account (Pro, Max, Teams, or API)

### Build from Source

```bash
git clone https://github.com/AadityaMishra1/Gilfoyle.git
cd Gilfoyle
npm install
npm run build
npm run package:mac   # or package:win or package:linux
```

Requires Node.js 20+, Python 3, and C++ build tools.

## Development

```bash
npm run dev          # dev server with HMR
npm run build        # production build
npm run typecheck    # type checking
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
