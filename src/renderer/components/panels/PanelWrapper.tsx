import React from "react";
import {
  Terminal,
  List,
  BarChart2,
  FolderTree,
  Network,
  Plug,
  Gauge,
} from "lucide-react";
import type { PanelId } from "../../stores/layout-store";

const PANEL_META: Record<PanelId, { title: string; icon: React.ReactNode }> = {
  terminal: { title: "Terminal", icon: <Terminal size={12} /> },
  sessions: { title: "Sessions", icon: <List size={12} /> },
  analytics: { title: "Analytics", icon: <BarChart2 size={12} /> },
  files: { title: "Files", icon: <FolderTree size={12} /> },
  swarm: { title: "Agents", icon: <Network size={12} /> },
  mcp: { title: "MCP", icon: <Plug size={12} /> },
  context: { title: "Context", icon: <Gauge size={12} /> },
};

interface PanelWrapperProps {
  panelId: PanelId;
  children: React.ReactNode;
}

const PanelWrapper: React.FC<PanelWrapperProps> = ({ panelId, children }) => {
  const meta = PANEL_META[panelId];

  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden rounded-md"
      style={{
        border: "1px solid rgba(41,37,36,0.6)",
        backgroundColor: "var(--bg-primary)",
      }}
    >
      {/* Panel header — 24px, gradient background, no visible bottom border */}
      <div
        className="flex items-center gap-1.5 px-2 shrink-0 select-none"
        style={{
          height: 24,
          background: "linear-gradient(180deg, #292524 0%, #1c1917 100%)",
        }}
      >
        <span className="text-stone-600">{meta.icon}</span>
        <span
          className="text-stone-500 text-[10px] tracking-widest uppercase"
          style={{ fontFamily: "'Geist', system-ui, sans-serif" }}
        >
          {meta.title}
        </span>
      </div>

      {/* Panel content — flush with header, no border separator */}
      <div className="flex-1 min-h-0 min-w-0 overflow-auto">{children}</div>
    </div>
  );
};

export default PanelWrapper;
