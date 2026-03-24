import path from "path";
import { randomUUID } from "crypto";
import type { ToolUseEvent } from "../../shared/types/events";
import type { ActivityEvent, ActivityType } from "../../shared/types/activity";

/**
 * Truncate a string to maxLen chars, appending '…' if truncated.
 */
function trunc(s: string, maxLen = 46): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "…";
}

/**
 * Safely extract a string field from an unknown record.
 */
function str(val: unknown): string {
  return typeof val === "string" ? val : "";
}

/**
 * Derive a short filename from an absolute or relative path.
 * Falls back to the raw value if path.basename yields an empty string.
 */
function basename(filePath: string): string {
  const b = path.basename(filePath);
  return b.length > 0 ? b : filePath;
}

/**
 * Icon and color mappings per activity type.
 */
const ICON_MAP: Record<ActivityType, string> = {
  file_create: "FilePlus",
  file_edit: "FileEdit",
  file_delete: "FileX",
  test_run: "TestTube2",
  git_op: "GitCommit",
  shell_cmd: "Terminal",
  tool_call: "Wrench",
  agent_spawn: "Bot",
  error: "AlertCircle",
};

const COLOR_MAP: Record<ActivityType, string> = {
  file_create: "blue-500",
  file_edit: "blue-400",
  file_delete: "red-500",
  test_run: "green-500",
  git_op: "amber-500",
  shell_cmd: "stone-400",
  tool_call: "stone-400",
  agent_spawn: "violet-500",
  error: "red-600",
};

/**
 * Classify a Bash command string into an activity type and summary.
 */
function classifyBash(command: string): {
  type: ActivityType;
  summary: string;
  detail: string;
} {
  const cmd = command.trim();
  const lower = cmd.toLowerCase();

  // Test runners
  if (/\b(jest|vitest|pytest|mocha|jasmine|karma|test)\b/.test(lower)) {
    return {
      type: "test_run",
      summary: "Ran tests",
      detail: cmd,
    };
  }

  // Git commit — extract message
  const commitMatch = cmd.match(
    /git\s+commit\s+(?:-[a-zA-Z]+\s+)*(?:(?:-m|--message)\s+["']?([^"'\n]+?)["']?\s*$|["']([^"']+)["'])/,
  );
  if (commitMatch) {
    const msg = (commitMatch[1] ?? commitMatch[2] ?? "").trim();
    return {
      type: "git_op",
      summary: trunc(
        msg.length > 0 ? `commit  ${msg}` : "commit  (no message)",
      ),
      detail: cmd,
    };
  }

  // Git push — extract remote/branch
  if (/\bgit\s+push\b/.test(lower)) {
    const pushMatch = cmd.match(
      /git\s+push\s+(?:-[a-zA-Z]+\s+)*(\S+)\s*(\S+)?/,
    );
    const remote = pushMatch?.[1] ?? "origin";
    const branch = pushMatch?.[2] ?? "";
    return {
      type: "git_op",
      summary: trunc(`push  ${remote}${branch ? " → " + branch : ""}`),
      detail: cmd,
    };
  }

  // Git pull
  if (/\bgit\s+pull\b/.test(lower)) {
    return {
      type: "git_op",
      summary: "pull  from remote",
      detail: cmd,
    };
  }

  // Git checkout / switch — extract branch
  if (/\bgit\s+(checkout|switch)\b/.test(lower)) {
    const branchMatch = cmd.match(
      /git\s+(?:checkout|switch)\s+(?:-[a-zA-Z]+\s+)*(\S+)/,
    );
    const branch = branchMatch?.[1] ?? "";
    return {
      type: "git_op",
      summary: trunc(`checkout  ${branch}`),
      detail: cmd,
    };
  }

  // Git merge
  if (/\bgit\s+merge\b/.test(lower)) {
    const mergeMatch = cmd.match(/git\s+merge\s+(?:-[a-zA-Z]+\s+)*(\S+)/);
    const branch = mergeMatch?.[1] ?? "";
    return {
      type: "git_op",
      summary: trunc(`merge  ${branch}`),
      detail: cmd,
    };
  }

  // Git stash
  if (/\bgit\s+stash\b/.test(lower)) {
    const stashCmd = cmd.match(/git\s+stash\s*(\w*)/)?.[1] ?? "push";
    return {
      type: "git_op",
      summary: `stash ${stashCmd}`,
      detail: cmd,
    };
  }

  // Git diff / status / log — informational
  if (/\bgit\s+(diff|status|log|show|branch)\b/.test(lower)) {
    const gitSubcmd = cmd.match(/git\s+(\w+)/)?.[1] ?? "";
    return {
      type: "git_op",
      summary: gitSubcmd,
      detail: cmd,
    };
  }

  // Other git operations
  if (/\bgit\b/.test(lower)) {
    const gitSubcmd = cmd.match(/git\s+(\w+)/)?.[1] ?? "";
    return {
      type: "git_op",
      summary: trunc(`git ${gitSubcmd}`),
      detail: cmd,
    };
  }

  // Package managers
  if (/\b(npm|yarn|pnpm|bun)\b/.test(lower)) {
    const parts = cmd.split(/\s+/).slice(0, 3).join(" ");
    return {
      type: "shell_cmd",
      summary: trunc(`Ran ${parts}`),
      detail: cmd,
    };
  }

  // Generic shell command
  return {
    type: "shell_cmd",
    summary: trunc(`Ran command`),
    detail: cmd,
  };
}

/**
 * Convert a raw ToolUseEvent into an ActivityEvent suitable for display.
 *
 * Returns null for tool calls that don't map to a meaningful activity
 * (e.g. unknown tool names with no useful input).
 */
export function parseToolUseToActivity(
  event: ToolUseEvent,
  sessionId: string,
  projectPath: string,
): ActivityEvent | null {
  const { toolName, input, timestamp } = event;

  let type: ActivityType = "tool_call";
  let summary = "";
  let detail: string | undefined;

  switch (toolName) {
    case "Write": {
      const filePath = str(
        input["file_path"] ?? input["path"] ?? input["filename"],
      );
      const name = filePath.length > 0 ? basename(filePath) : "file";
      type = "file_create";
      summary = trunc(`Created ${name}`);
      detail = filePath.length > 0 ? filePath : undefined;
      break;
    }

    case "Edit":
    case "MultiEdit": {
      const filePath = str(
        input["file_path"] ?? input["path"] ?? input["filename"],
      );
      const name = filePath.length > 0 ? basename(filePath) : "file";

      // Attempt to derive line-change counts from old/new content.
      const oldContent = str(input["old_string"] ?? input["old_content"] ?? "");
      const newContent = str(input["new_string"] ?? input["new_content"] ?? "");
      let changeSuffix = "";
      if (oldContent.length > 0 || newContent.length > 0) {
        const removed = oldContent.split("\n").length;
        const added = newContent.split("\n").length;
        changeSuffix = ` (+${added} -${removed})`;
      }

      type = "file_edit";
      summary = trunc(`Edited ${name}${changeSuffix}`);
      detail = filePath.length > 0 ? filePath : undefined;
      break;
    }

    case "Delete":
    case "DeleteFile": {
      const filePath = str(
        input["file_path"] ?? input["path"] ?? input["filename"],
      );
      const name = filePath.length > 0 ? basename(filePath) : "file";
      type = "file_delete";
      summary = trunc(`Deleted ${name}`);
      detail = filePath.length > 0 ? filePath : undefined;
      break;
    }

    case "Bash": {
      const command = str(input["command"] ?? input["cmd"] ?? "");
      if (command.length === 0) return null;
      const classified = classifyBash(command);
      type = classified.type;
      summary = classified.summary;
      detail = classified.detail;
      break;
    }

    case "Read": {
      const filePath = str(
        input["file_path"] ?? input["path"] ?? input["filename"],
      );
      const name = filePath.length > 0 ? basename(filePath) : "file";
      type = "tool_call";
      summary = trunc(`Read ${name}`);
      detail = filePath.length > 0 ? filePath : undefined;
      break;
    }

    case "Glob":
    case "Grep": {
      const pattern = str(
        input["pattern"] ?? input["glob"] ?? input["query"] ?? "",
      );
      type = "tool_call";
      summary =
        pattern.length > 0 ? trunc(`Searched: ${pattern}`) : "Searched files";
      detail = pattern.length > 0 ? pattern : undefined;
      break;
    }

    case "Agent":
    case "Task": {
      const agentName = str(
        input["name"] ?? input["agent"] ?? input["task"] ?? "",
      );
      type = "agent_spawn";
      summary =
        agentName.length > 0
          ? trunc(`Spawned agent: ${agentName}`)
          : "Spawned agent";
      detail = agentName.length > 0 ? agentName : undefined;
      break;
    }

    default: {
      // Surface unrecognised tool calls as generic tool_call events.
      type = "tool_call";
      summary = trunc(`Used tool: ${toolName}`);
      break;
    }
  }

  if (summary.length === 0) return null;

  return {
    id: randomUUID(),
    type,
    summary,
    detail,
    timestamp,
    sessionId,
    projectPath,
    icon: ICON_MAP[type],
    color: COLOR_MAP[type],
  };
}
