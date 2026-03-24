# Contributing to Gilfoyle

Thank you for your interest in contributing to Gilfoyle. This document covers everything you need to get started.

## Reporting Bugs

Open an issue on [GitHub Issues](https://github.com/AadityaMishra1/Gilfoyle/issues) using the **Bug Report** template. Please include:

- Your operating system and version
- Gilfoyle version
- Claude Code CLI version (`claude --version`)
- Steps to reproduce the issue
- Expected vs actual behavior
- Screenshots or terminal output, if applicable

## Suggesting Features

Open an issue using the **Feature Request** template. Describe the problem you are trying to solve, your proposed solution, and any alternatives you considered.

## Development Setup

```bash
git clone https://github.com/AadityaMishra1/Gilfoyle.git
cd Gilfoyle
npm install
npm run dev
```

This starts the electron-vite dev server with hot module replacement. The app will open automatically.

**Prerequisites:** Node.js 20+, npm, Python 3 (for node-pty native build), C++ build tools.

## Pull Request Process

1. **Fork** the repository and create a branch from `main`.
2. **Make your changes** with clear, focused commits.
3. **Test your changes** — run all checks before submitting:
   ```bash
   npm test
   npm run typecheck
   npm run lint
   npm run build
   ```
4. **Submit a pull request** against `main` with a clear description of what changed and why.

## Code Style

- **TypeScript strict mode** — all code must pass `tsc --noEmit` with no errors.
- **Relative imports only** — use `../../shared/pricing`, not `@shared/pricing`. Path aliases do not resolve through electron-vite's `externalizeDepsPlugin`.
- **Tailwind CSS** for all styling — no CSS modules or styled-components.
- **node-pty** must be loaded with `require("node-pty")`, not `import` — the native `.node` addon cannot be bundled by Vite.
- Keep files under 500 lines where possible.

## Project Structure

- `src/main/` — Electron main process (Node.js, PTY, IPC handlers, services)
- `src/preload/` — Context bridge between main and renderer
- `src/renderer/` — React app (components, stores, hooks)
- `src/shared/` — Types, utilities, and IPC channel constants shared across processes
- `tests/` — Test files

## Important Notes

- The terminal must preserve 100% of Claude Code CLI capabilities. Never intercept, filter, or modify PTY I/O.
- Build output goes to `out/`, not `dist/`.
- Always verify the app builds and runs after making changes: `npm run build && npm run dev`.
