import { create } from "zustand";
import type { ActivityEvent, ActivityType } from "../../shared/types/activity";

/** Maximum number of activities held in memory. Oldest are evicted first. */
const MAX_ACTIVITIES = 500;

type ActivityFilter = ActivityType | "all";

/**
 * Maps UI filter labels to the underlying activity types they cover.
 */
const FILTER_TYPE_MAP: Record<string, ActivityType[]> = {
  files: ["file_create", "file_edit", "file_delete"],
  tests: ["test_run"],
  git: ["git_op"],
  commands: ["shell_cmd", "tool_call", "agent_spawn"],
};

interface ActivityStore {
  activities: ActivityEvent[];
  filter: ActivityFilter;
  /** When set, only show activities whose projectPath matches. */
  projectFilter: string | null;

  addActivity: (event: ActivityEvent) => void;
  addActivities: (events: ActivityEvent[]) => void;
  setFilter: (filter: ActivityFilter) => void;
  setProjectFilter: (path: string | null) => void;
  clearActivities: () => void;

  /**
   * Return the filtered activity list sorted newest-first.
   * Filters by both type and project when set.
   */
  getFiltered: () => ActivityEvent[];
}

export const useActivityStore = create<ActivityStore>((set, get) => ({
  activities: [],
  filter: "all",
  projectFilter: null,

  addActivity: (event) =>
    set((state) => {
      const next = [event, ...state.activities];
      if (next.length > MAX_ACTIVITIES) next.length = MAX_ACTIVITIES;
      return { activities: next };
    }),

  addActivities: (events) =>
    set((state) => {
      // Merge incoming events at the front, then sort descending.
      const merged = [...events, ...state.activities];
      merged.sort((a, b) => b.timestamp - a.timestamp);
      if (merged.length > MAX_ACTIVITIES) merged.length = MAX_ACTIVITIES;
      return { activities: merged };
    }),

  setFilter: (filter) => set({ filter }),

  setProjectFilter: (path) => set({ projectFilter: path }),

  clearActivities: () => set({ activities: [] }),

  getFiltered: () => {
    const { activities, filter, projectFilter } = get();

    let result = activities;

    // Filter by project when set.
    if (projectFilter !== null) {
      result = result.filter((a) => a.projectPath === projectFilter);
    }

    if (filter === "all") return result;

    // Check group filters first.
    const groupTypes = FILTER_TYPE_MAP[filter as string];
    if (groupTypes !== undefined) {
      return result.filter((a) => groupTypes.includes(a.type));
    }

    // Direct type filter.
    return result.filter((a) => a.type === filter);
  },
}));
