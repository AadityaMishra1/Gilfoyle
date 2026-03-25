import React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useLayoutStore, type ActiveInfoTab } from "../../stores/layout-store";
import { ActivityFeed } from "../activity/ActivityFeed";
import { GitPanel } from "../activity/GitPanel";
import ToolsPanel from "../tools/ToolsPanel";

// ─── Tab definitions ──────────────────────────────────────────────────────────

interface TabDef {
  id: ActiveInfoTab;
  label: string;
}

const TABS: TabDef[] = [
  { id: "activity", label: "Activity" },
  { id: "git", label: "Git" },
  { id: "tools", label: "Tools" },
];

// ─── InfoTabs ─────────────────────────────────────────────────────────────────

interface InfoTabsProps {
  projectPath?: string;
}

const InfoTabs: React.FC<InfoTabsProps> = ({ projectPath }) => {
  const {
    activeInfoTab,
    setActiveInfoTab,
    infoPanelCollapsed,
    toggleInfoPanel,
  } = useLayoutStore();

  let content: React.ReactNode;
  switch (activeInfoTab) {
    case "activity":
      content = <ActivityFeed projectPath={projectPath} />;
      break;
    case "git":
      content = <GitPanel projectPath={projectPath} />;
      break;
    case "tools":
      content = <ToolsPanel projectPath={projectPath} />;
      break;
    default:
      content = <ActivityFeed projectPath={projectPath} />;
  }

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      {/* Tab bar */}
      <div
        className="flex items-end shrink-0 px-3 border-b border-stone-800"
        style={{ height: 28 }}
        role="tablist"
        aria-label="Project info tabs"
      >
        {TABS.map((tab) => {
          const isActive = tab.id === activeInfoTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveInfoTab(tab.id)}
              className="flex items-center px-3 h-full text-xs transition-colors shrink-0"
              style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 11,
                color: isActive ? "var(--accent-primary)" : "var(--text-muted)",
                borderBottom: isActive
                  ? "2px solid var(--accent-primary)"
                  : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {tab.label}
            </button>
          );
        })}

        {/* Collapse toggle */}
        <div className="flex-1" />
        <button
          type="button"
          onClick={toggleInfoPanel}
          className="flex items-center justify-center w-5 h-5 rounded text-stone-600 hover:text-stone-400 hover:bg-stone-800 transition-colors mb-0.5"
          title={infoPanelCollapsed ? "Expand panel" : "Collapse panel"}
          aria-label={infoPanelCollapsed ? "Expand panel" : "Collapse panel"}
        >
          {infoPanelCollapsed ? (
            <ChevronUp size={12} />
          ) : (
            <ChevronDown size={12} />
          )}
        </button>
      </div>

      {/* Content — hidden when collapsed */}
      {!infoPanelCollapsed && (
        <div className="flex-1 min-h-0 overflow-hidden">{content}</div>
      )}
    </div>
  );
};

export default InfoTabs;
