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

export type InlineEditMode = "create-file" | "create-folder" | "rename";

export interface InlineEditState {
  /** The mode of the inline edit. */
  mode: InlineEditMode;
  /** For create: the parent directory path (relative). For rename: the path of the target. */
  targetPath: string;
  /** Whether the target is at the root level (empty string targetPath). */
  isRoot?: boolean;
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
  /** Inline edit state for create/rename in the tree, or null when idle. */
  inlineEdit: InlineEditState | null;

  setFileTree: (tree: FileEntry[]) => void;
  setCwd: (cwd: string | null) => void;
  toggleExpanded: (path: string) => void;
  selectFile: (path: string | null) => void;
  setCurrentDiff: (diff: FileDiff | null) => void;
  addTouchedFile: (path: string) => void;
  /** Insert a file or directory into the tree at the given relative path. */
  insertFileEntry: (filePath: string, isDirectory?: boolean) => void;
  /** Remove a file or directory from the tree by its relative path. */
  removeFileEntry: (filePath: string) => void;
  /** Start an inline edit in the tree (create-file, create-folder, rename). */
  startInlineEdit: (edit: InlineEditState) => void;
  /** Cancel the current inline edit. */
  cancelInlineEdit: () => void;
  /** Rename an entry in the tree (updates path and name). */
  renameFileEntry: (oldPath: string, newPath: string) => void;
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
  inlineEdit: null,

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

  insertFileEntry: (filePath, isDirectory = false) =>
    set((state) => {
      const segments = filePath.split("/").filter(Boolean);
      if (segments.length === 0) return {};

      // Deep-clone the tree so we can mutate safely.
      const tree = JSON.parse(JSON.stringify(state.fileTree)) as FileEntry[];

      // Walk the tree, creating intermediate directories as needed.
      let children = tree;
      for (let i = 0; i < segments.length - 1; i++) {
        const seg = segments[i]!;
        const dirPath = segments.slice(0, i + 1).join("/");
        let dir = children.find((e) => e.name === seg && e.isDirectory);
        if (!dir) {
          dir = { path: dirPath, name: seg, isDirectory: true, children: [] };
          children.push(dir);
          // Keep sorted: directories first, then alphabetical.
          children.sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
        }
        if (!dir.children) dir.children = [];
        children = dir.children;
      }

      // Insert the leaf entry if it doesn't already exist.
      const leafName = segments[segments.length - 1]!;
      const exists = children.some((e) => e.name === leafName);
      if (exists) return {};

      children.push({
        path: filePath,
        name: leafName,
        isDirectory,
        ...(isDirectory ? { children: [] } : {}),
      });
      children.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return { fileTree: tree };
    }),

  removeFileEntry: (filePath) =>
    set((state) => {
      const segments = filePath.split("/").filter(Boolean);
      if (segments.length === 0) return {};

      const tree = JSON.parse(JSON.stringify(state.fileTree)) as FileEntry[];

      // Walk to the parent, then splice out the target.
      let children = tree;
      for (let i = 0; i < segments.length - 1; i++) {
        const seg = segments[i]!;
        const dir = children.find((e) => e.name === seg && e.isDirectory);
        if (!dir || !dir.children) return {}; // Parent doesn't exist — nothing to remove.
        children = dir.children;
      }

      const leafName = segments[segments.length - 1]!;
      const idx = children.findIndex((e) => e.name === leafName);
      if (idx === -1) return {}; // Already gone.
      children.splice(idx, 1);

      return { fileTree: tree };
    }),

  startInlineEdit: (edit) =>
    set((state) => {
      // If creating inside a folder, auto-expand it.
      if (edit.mode !== "rename" && edit.targetPath) {
        const next = new Set(state.expandedPaths);
        next.add(edit.targetPath);
        return { inlineEdit: edit, expandedPaths: next };
      }
      return { inlineEdit: edit };
    }),

  cancelInlineEdit: () => set({ inlineEdit: null }),

  renameFileEntry: (oldPath, newPath) =>
    set((state) => {
      const tree = JSON.parse(JSON.stringify(state.fileTree)) as FileEntry[];

      // Find and remove the old entry.
      const oldSegments = oldPath.split("/").filter(Boolean);
      let oldParent = tree;
      for (let i = 0; i < oldSegments.length - 1; i++) {
        const dir = oldParent.find(
          (e) => e.name === oldSegments[i]! && e.isDirectory,
        );
        if (!dir || !dir.children) return {};
        oldParent = dir.children;
      }
      const oldIdx = oldParent.findIndex(
        (e) => e.name === oldSegments[oldSegments.length - 1]!,
      );
      if (oldIdx === -1) return {};
      const [entry] = oldParent.splice(oldIdx, 1);
      if (!entry) return {};

      // Update the entry's path and name.
      const newSegments = newPath.split("/").filter(Boolean);
      const newName = newSegments[newSegments.length - 1]!;

      // Recursively update paths for directories.
      function updatePaths(e: FileEntry, basePath: string): void {
        e.path = basePath;
        e.name = basePath.split("/").pop()!;
        if (e.children) {
          for (const child of e.children) {
            updatePaths(child, basePath + "/" + child.name);
          }
        }
      }
      updatePaths(entry, newPath);
      entry.name = newName;

      // Insert into the new parent location.
      let newParent = tree;
      for (let i = 0; i < newSegments.length - 1; i++) {
        const dir = newParent.find(
          (e) => e.name === newSegments[i]! && e.isDirectory,
        );
        if (!dir || !dir.children) return {};
        newParent = dir.children;
      }
      newParent.push(entry);
      newParent.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      // Update selection if it was the renamed file.
      const selectedFile =
        state.selectedFile === oldPath ? newPath : state.selectedFile;

      return { fileTree: tree, selectedFile, inlineEdit: null };
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
      inlineEdit: null,
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
