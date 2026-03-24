/**
 * ToolsPanel — Info Tabs "Tools" tab content.
 *
 * Three collapsible sections stacked vertically:
 *   1. MCP Servers  — from useMCPStore
 *   2. Active Agents — from stream events (Task/Agent tool use)
 *   3. Hooks         — from ~/.claude/settings.json via preload bridge
 */

import React from 'react'
import MCPSection from './MCPSection'
import AgentSection from './AgentSection'
import HooksSection from './HooksSection'

const ToolsPanel: React.FC = () => (
  <div
    className="flex flex-col h-full w-full overflow-y-auto overflow-x-hidden"
    style={{ backgroundColor: '#0e0c0b' }}
  >
    <MCPSection />
    <AgentSection />
    <HooksSection />
    {/* Spacer to fill remaining height */}
    <div className="flex-1" />
  </div>
)

export default ToolsPanel
