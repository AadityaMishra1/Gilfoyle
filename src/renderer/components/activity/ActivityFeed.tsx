import React, { useEffect } from "react";
import { useActivityStore } from "../../stores/activity-store";
import { ActivityItem } from "./ActivityItem";

// ─── Component ────────────────────────────────────────────────────────────────

interface ActivityFeedProps {
  projectPath?: string;
}

export function ActivityFeed({
  projectPath,
}: ActivityFeedProps): React.ReactElement {
  const setProjectFilter = useActivityStore((s) => s.setProjectFilter);
  const getFiltered = useActivityStore((s) => s.getFiltered);
  const addActivities = useActivityStore((s) => s.addActivities);
  const addActivity = useActivityStore((s) => s.addActivity);

  const filtered = getFiltered();

  // Set project filter on mount, clear on unmount.
  useEffect(() => {
    setProjectFilter(projectPath ?? null);
    return () => {
      setProjectFilter(null);
    };
  }, [projectPath, setProjectFilter]);

  // Load initial activities and subscribe to live events.
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    window.claude
      .getActivities()
      .then((activities) => {
        if (activities.length > 0) {
          addActivities(activities);
        }
      })
      .catch(() => {
        // Non-fatal — feed will populate from live events.
      });

    unsubscribe = window.claude.onActivityNew((activity) => {
      addActivity(activity);
    });

    return () => {
      unsubscribe?.();
    };
  }, [addActivities, addActivity]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden"
        role="feed"
        aria-label="Activity feed"
        aria-live="polite"
        aria-relevant="additions"
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-1 text-stone-600 text-[12px] select-none">
            <span>No activity yet</span>
            <span className="text-stone-700 text-[10px]">
              Activity appears when Claude uses tools in a session
            </span>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-stone-800/50">
            {filtered.map((activity) => (
              <ActivityItem key={activity.id} activity={activity} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
