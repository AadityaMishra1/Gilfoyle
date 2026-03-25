/**
 * ToolsPanel — Info Tabs "Tools" tab content.
 *
 * Three collapsible sections stacked vertically:
 *   1. MCP Servers  — from useMCPStore (global, system-level)
 *   2. Active Agents — from stream events
 *   3. Hooks         — from ~/.claude/settings.json (global, system-level)
 */

import React from "react";
import MCPSection from "./MCPSection";
import AgentSection from "./AgentSection";
import HooksSection from "./HooksSection";

interface ToolsPanelProps {
  projectPath?: string;
}

const ToolsPanel: React.FC<ToolsPanelProps> = ({ projectPath }) => (
  <div
    className="flex flex-col h-full w-full overflow-y-auto overflow-x-hidden"
    style={{ backgroundColor: "var(--bg-primary)" }}
  >
    <MCPSection />
    <AgentSection projectPath={projectPath} />
    <HooksSection />
    <div className="flex-1" />
  </div>
);

export default ToolsPanel;
