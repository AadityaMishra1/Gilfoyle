/**
 * Utilities for encoding and decoding Claude Code's project-path encoding scheme.
 *
 * Claude Code stores per-project session data under:
 *   ~/.claude/projects/{encoded-cwd}/
 *
 * The encoding replaces path separators with dashes:
 *   - macOS/Linux: `/Users/foo/Projects/MyApp` -> `-Users-foo-Projects-MyApp`
 *   - Windows:     `C:\Users\foo\Projects\MyApp` -> `-C--Users-foo-Projects-MyApp`
 *
 * These functions are intentionally pure (no filesystem I/O) so they can be
 * used in both the main process and the renderer without bridging.
 */

/**
 * Decode an encoded project-path directory name back to an absolute filesystem
 * path.
 *
 * @param encoded - The directory name as it appears under `~/.claude/projects/`,
 *   e.g. `-Users-foo-Projects-MyApp`.
 * @returns The original absolute path, e.g. `/Users/foo/Projects/MyApp`.
 */
export function decodeProjectPath(encoded: string): string {
  if (process.platform === 'win32') {
    // Encoded Windows example: -C--Users-foo-Projects-MyApp
    // Step 1: strip the leading dash that represents the path root
    // Step 2: replace all remaining dashes with backslashes
    // Step 3: restore the drive-letter colon (first segment looks like "C\")
    return encoded
      .replace(/^-/, '')
      .replace(/-/g, '\\')
      .replace(/^([A-Za-z])\\/, '$1:')
  }
  // macOS/Linux: every dash becomes a forward slash.
  // The leading dash correctly becomes the root "/".
  return encoded.replace(/-/g, '/')
}

/**
 * Encode an absolute filesystem path into Claude Code's storage directory name.
 *
 * @param path - Absolute filesystem path, e.g. `/Users/foo/Projects/MyApp`.
 * @returns Encoded directory name, e.g. `-Users-foo-Projects-MyApp`.
 */
export function encodeProjectPath(path: string): string {
  if (process.platform === 'win32') {
    // Replace colon, backslash, and forward slash all with dashes,
    // then prepend a dash to represent the root.
    return '-' + path.replace(/[:\\/]/g, '-')
  }
  // Replace every forward slash with a dash.
  // The leading "/" becomes the leading "-".
  return path.replace(/\//g, '-')
}

/**
 * Shorten an absolute path for display by substituting the user's home
 * directory with `~`.
 *
 * @param fullPath - The absolute path to shorten.
 * @param homeDir - The current user's home directory (e.g. from `os.homedir()`).
 * @returns A tilde-prefixed path when `fullPath` is inside `homeDir`, otherwise
 *   the original `fullPath` unchanged.
 *
 * @example
 * shortenPath('/Users/foo/Projects/MyApp', '/Users/foo')
 * // => '~/Projects/MyApp'
 */
export function shortenPath(fullPath: string, homeDir: string): string {
  if (fullPath.startsWith(homeDir)) {
    return '~' + fullPath.slice(homeDir.length)
  }
  return fullPath
}
