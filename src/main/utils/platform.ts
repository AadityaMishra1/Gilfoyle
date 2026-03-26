/**
 * Cross-platform helpers for PATH, home directory, and shell resolution.
 * Shared between pty-manager and ipc/handlers to avoid duplicating logic.
 */
import os from "os";
import path from "path";

/** Platform-safe home directory (works on macOS, Linux, and Windows). */
export function getHomeDir(): string {
  return os.homedir();
}

/**
 * Default shell for spawning processes.
 * On macOS/Linux, prefers $SHELL, falls back to /bin/bash.
 * On Windows, prefers %COMSPEC%, falls back to powershell.exe.
 */
export function getDefaultShell(): string {
  if (process.platform === "win32") {
    return process.env.COMSPEC ?? "powershell.exe";
  }
  return process.env.SHELL ?? "/bin/bash";
}

/**
 * Build a PATH string that includes common install locations for CLI tools
 * (homebrew, cargo, nvm, npm, snap, etc.) so that spawned processes can
 * find `claude`, `git`, `starship`, and similar tools even when Electron
 * strips the user's login PATH.
 */
export function getEnhancedPath(): string {
  const isWin = process.platform === "win32";
  const sep = isWin ? ";" : ":";
  const home = getHomeDir();

  const extraPaths = isWin
    ? [
        path.join(home, "AppData", "Roaming", "npm"),
        path.join(home, ".cargo", "bin"),
        path.join(home, ".local", "bin"),
        path.join(home, "AppData", "Local", "npm"),
        path.join(home, ".npm-global", "bin"),
      ]
    : [
        // Homebrew on Apple Silicon and Intel Macs
        "/opt/homebrew/bin",
        "/usr/local/bin",
        // Common Linux paths
        "/usr/bin",
        "/snap/bin",
        "/home/linuxbrew/.linuxbrew/bin",
        // User-local paths
        path.join(home, ".cargo", "bin"),
        path.join(home, ".local", "bin"),
        path.join(home, ".nvm", "versions", "node", "current", "bin"),
        path.join(home, ".npm-global", "bin"),
      ];

  return [...extraPaths, process.env.PATH ?? ""].join(sep);
}
