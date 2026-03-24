/**
 * PluginDiscovery — Fetches trending Claude Code plugins from GitHub
 * and merges with the bundled registry. Results are cached on disk.
 */

import * as fs from "fs";
import * as path from "path";
import * as https from "https";

export interface DiscoveredPlugin {
  id: string;
  name: string;
  description: string;
  category: string;
  stars: number;
  repo: string;
  installCommand: string;
  tags: string[];
  essential: boolean;
  source: "bundled" | "github";
}

interface GitHubSearchResult {
  items: Array<{
    full_name: string;
    name: string;
    description: string | null;
    stargazers_count: number;
    topics: string[];
    html_url: string;
  }>;
}

const CACHE_FILE = ".gilfoyle-plugin-cache.json";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function getCachePath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || process.cwd();
  return path.join(homeDir, ".claude", CACHE_FILE);
}

function readCache(): DiscoveredPlugin[] | null {
  try {
    const cachePath = getCachePath();
    if (!fs.existsSync(cachePath)) return null;
    const raw = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    if (
      raw &&
      typeof raw.timestamp === "number" &&
      Date.now() - raw.timestamp < CACHE_TTL_MS &&
      Array.isArray(raw.plugins)
    ) {
      return raw.plugins;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCache(plugins: DiscoveredPlugin[]): void {
  try {
    const cachePath = getCachePath();
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      cachePath,
      JSON.stringify({ timestamp: Date.now(), plugins }, null, 2),
      "utf8",
    );
  } catch {
    // Best-effort caching
  }
}

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "Gilfoyle/1.0",
          Accept: "application/vnd.github.v3+json",
        },
        timeout: 10_000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => resolve(data));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
  });
}

function inferCategory(topics: string[], name: string): string {
  const all = [...topics, name.toLowerCase()];
  if (all.some((t) => t.includes("mcp") || t.includes("server"))) return "mcp";
  if (all.some((t) => t.includes("memory") || t.includes("persist")))
    return "memory";
  if (all.some((t) => t.includes("security") || t.includes("safety")))
    return "security";
  if (all.some((t) => t.includes("hook"))) return "hooks";
  if (all.some((t) => t.includes("skill"))) return "skills";
  if (
    all.some(
      (t) =>
        t.includes("analytics") || t.includes("usage") || t.includes("cost"),
    )
  )
    return "analytics";
  if (all.some((t) => t.includes("automat") || t.includes("loop")))
    return "automation";
  return "toolkit";
}

function inferInstallCommand(repo: string): string {
  return `git clone https://github.com/${repo}`;
}

async function fetchFromGitHub(): Promise<DiscoveredPlugin[]> {
  const queries = [
    "topic:claude-code-plugin",
    "topic:claude-code-plugins",
    "claude+code+plugin+language:TypeScript",
  ];

  const seen = new Set<string>();
  const results: DiscoveredPlugin[] = [];

  for (const q of queries) {
    try {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=15`;
      const body = await httpsGet(url);
      const data: GitHubSearchResult = JSON.parse(body);

      for (const item of data.items) {
        if (seen.has(item.full_name)) continue;
        seen.add(item.full_name);

        if (item.stargazers_count < 100) continue;

        results.push({
          id: item.full_name.replace("/", "-").toLowerCase(),
          name: item.name
            .replace(/[-_]/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase()),
          description: item.description ?? "No description available",
          category: inferCategory(item.topics, item.name),
          stars: item.stargazers_count,
          repo: item.full_name,
          installCommand: inferInstallCommand(item.full_name),
          tags: item.topics.slice(0, 5),
          essential: false,
          source: "github",
        });
      }
    } catch {
      // Skip failed queries, continue with others
    }
  }

  return results;
}

/**
 * Discover plugins by merging bundled registry with GitHub results.
 * Bundled entries always take priority over GitHub-discovered ones.
 */
export async function discoverPlugins(
  bundledPlugins: DiscoveredPlugin[],
): Promise<DiscoveredPlugin[]> {
  // Check cache first
  const cached = readCache();
  if (cached) return cached;

  // Fetch from GitHub
  let githubPlugins: DiscoveredPlugin[] = [];
  try {
    githubPlugins = await fetchFromGitHub();
  } catch {
    // If GitHub fails, return just bundled
    return bundledPlugins;
  }

  // Merge: bundled takes priority
  const bundledRepos = new Set(bundledPlugins.map((p) => p.repo.toLowerCase()));
  const merged = [
    ...bundledPlugins,
    ...githubPlugins.filter((p) => !bundledRepos.has(p.repo.toLowerCase())),
  ];

  // Sort: essentials first, then by stars
  merged.sort((a, b) => {
    if (a.essential && !b.essential) return -1;
    if (!a.essential && b.essential) return 1;
    return b.stars - a.stars;
  });

  writeCache(merged);
  return merged;
}
