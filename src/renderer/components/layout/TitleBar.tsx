import React from "react";
import { useProjectStore } from "../../stores/project-store";
import { useTabStore } from "../../stores/tab-store";

const TitleBar: React.FC = () => {
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath);
  const projects = useProjectStore((s) => s.projects);
  const bootedProjects = useTabStore((s) => s.bootedProjects);
  const openCount = projects.filter((p) => bootedProjects.has(p.path)).length;

  const displayPath = activeProjectPath
    ? activeProjectPath.replace(/^\/Users\/[^/]+/, "~")
    : "Gilfoyle";

  return (
    <div
      className="drag-region flex items-center justify-between shrink-0 relative"
      style={{
        height: 32,
        backgroundColor: "var(--bg-primary)",
        boxShadow: "var(--shadow-title)",
        transition: "background-color 0.2s ease",
      }}
    >
      {/* Subtle bottom gradient line */}
      <div
        className="absolute inset-x-0 bottom-0 h-px pointer-events-none"
        style={{ background: "var(--gradient-line)" }}
        aria-hidden="true"
      />

      {/* Left: traffic-light placeholder */}
      <div className="no-drag" style={{ width: 80 }} />

      {/* Center: project path */}
      <div className="flex items-center gap-2 select-none pointer-events-none min-w-0 max-w-xs">
        <span
          className="text-xs truncate tracking-wide"
          style={{
            fontFamily: "'Geist Mono', monospace",
            color: "var(--text-muted)",
          }}
          title={activeProjectPath ?? "Gilfoyle"}
        >
          {displayPath}
        </span>
      </div>

      {/* Right: project count */}
      <div
        className="no-drag flex items-center gap-1.5 pr-4"
        style={{ width: 140, justifyContent: "flex-end" }}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
          style={{
            backgroundColor: activeProjectPath
              ? "var(--success)"
              : "var(--text-dim)",
          }}
          aria-hidden="true"
        />
        <span
          className="shrink-0"
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          {openCount > 0
            ? `${openCount} open`
            : `${projects.length} ${projects.length === 1 ? "project" : "projects"}`}
        </span>
      </div>
    </div>
  );
};

export default TitleBar;
