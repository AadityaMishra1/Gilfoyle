import { create } from "zustand";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FileEntry {
  /** Path relative to the session CWD, using forward-slashes. */
  path: string;
  /** Basename only — the display name shown in the tree. */
  name: string;
  isDirectory: boolean;
  /** Populated for directories after they have been expanded. */
  children?: FileEntry[];
  /** True when Claude has written to this file during the current session. */
  modified?: boolean;
}

export interface FileDiff {
  /** Path relative to session CWD. */
  filePath: string;
  /** Full file content before Claude's edit (empty string for new files). */
  before: string;
  /** Full file content after Claude's edit. */
  after: string;
}

interface FileStore {
  /** Flat-root tree mirroring the session CWD. */
  fileTree: FileEntry[];
  /** Paths of directories the user has opened in the tree UI. */
  expandedPaths: Set<string>;
  /** Path of the file currently highlighted in the tree. */
  selectedFile: string | null;
  /** Diff to display in the DiffViewer, or null when nothing is selected. */
  currentDiff: FileDiff | null;
  /** Paths of files Claude has touched (written/created) during this session. */
  touchedFiles: Set<string>;
  /** Absolute path of the session working directory shown in the header. */
  cwd: string | null;
  /** Absolute path of the file currently open in the editor, or null. */
  openFile: string | null;
  /** Content of the file open in the editor. */
  openFileContent: string;
  /** True when the editor has unsaved changes. */
  dirty: boolean;

  setFileTree: (tree: FileEntry[]) => void;
  setCwd: (cwd: string | null) => void;
  toggleExpanded: (path: string) => void;
  selectFile: (path: string | null) => void;
  setCurrentDiff: (diff: FileDiff | null) => void;
  addTouchedFile: (path: string) => void;
  clearSession: () => void;
  setOpenFile: (path: string | null, content?: string) => void;
  setDirty: (dirty: boolean) => void;
  closeFile: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useFileStore = create<FileStore>((set) => ({
  fileTree: [],
  expandedPaths: new Set<string>(),
  selectedFile: null,
  currentDiff: null,
  touchedFiles: new Set<string>(),
  cwd: null,
  openFile: null,
  openFileContent: "",
  dirty: false,

  setFileTree: (tree) => set({ fileTree: tree }),

  setCwd: (cwd) =>
    set({
      cwd,
      fileTree: [],
      touchedFiles: new Set<string>(),
      expandedPaths: new Set<string>(),
      selectedFile: null,
      currentDiff: null,
    }),

  toggleExpanded: (path) =>
    set((state) => {
      const next = new Set(state.expandedPaths);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return { expandedPaths: next };
    }),

  selectFile: (path) => set({ selectedFile: path }),

  setCurrentDiff: (diff) => set({ currentDiff: diff }),

  addTouchedFile: (path) =>
    set((state) => {
      // Avoid triggering a re-render when the file is already tracked.
      if (state.touchedFiles.has(path)) return {};
      const next = new Set(state.touchedFiles);
      next.add(path);
      return { touchedFiles: next };
    }),

  clearSession: () =>
    set({
      fileTree: [],
      expandedPaths: new Set<string>(),
      selectedFile: null,
      currentDiff: null,
      touchedFiles: new Set<string>(),
      cwd: null,
      openFile: null,
      openFileContent: "",
      dirty: false,
    }),

  setOpenFile: (path, content) =>
    set({
      openFile: path,
      openFileContent: content ?? "",
      dirty: false,
    }),

  setDirty: (dirty) => set({ dirty }),

  closeFile: () => set({ openFile: null, openFileContent: "", dirty: false }),
}));
