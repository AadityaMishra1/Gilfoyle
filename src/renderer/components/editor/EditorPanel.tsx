import React, { useCallback, useState } from "react";
import { X, Save, Terminal as TermIcon } from "lucide-react";
import { CodeEditor } from "./CodeEditor";
import { useFileStore } from "../../stores/file-store";
import { useClaudeAPI } from "../../hooks/use-ipc";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function basename(filePath: string): string {
  const parts = filePath.split("/");
  return parts[parts.length - 1] ?? filePath;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EditorPanel(): React.ReactElement {
  const claude = useClaudeAPI();
  const openFile = useFileStore((s) => s.openFile);
  const openFileContent = useFileStore((s) => s.openFileContent);
  const dirty = useFileStore((s) => s.dirty);
  const setDirty = useFileStore((s) => s.setDirty);
  const closeFile = useFileStore((s) => s.closeFile);
  const setOpenFile = useFileStore((s) => s.setOpenFile);

  const [vimMode, setVimMode] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastContent, setLastContent] = useState(openFileContent);

  if (!openFile) return <div />;

  const handleChange = useCallback(
    (content: string) => {
      setLastContent(content);
      if (!dirty) setDirty(true);
    },
    [dirty, setDirty],
  );

  const handleSave = useCallback(
    async (content: string) => {
      if (!openFile) return;
      setSaving(true);
      try {
        const ok = await claude.writeFile(openFile, content);
        if (ok) {
          setDirty(false);
          setOpenFile(openFile, content);
        }
      } catch {
        // Save failed — keep dirty state
      } finally {
        setSaving(false);
      }
    },
    [openFile, claude, setDirty, setOpenFile],
  );

  const handleClose = useCallback(() => {
    closeFile();
  }, [closeFile]);

  const name = basename(openFile);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden border-l border-stone-800">
      {/* Header bar */}
      <div
        className="flex items-center gap-2 px-2 shrink-0 bg-stone-900 border-b border-stone-800"
        style={{ height: 28 }}
      >
        <TermIcon size={11} className="text-stone-600 shrink-0" />
        <span
          className="flex-1 text-stone-300 truncate"
          style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace" }}
          title={openFile}
        >
          {name}
          {dirty && (
            <span className="text-amber-500 ml-1" title="Unsaved changes">
              ●
            </span>
          )}
        </span>

        {/* Save indicator */}
        {saving && (
          <span
            className="text-stone-500"
            style={{ fontSize: 9, fontFamily: "'Geist Mono', monospace" }}
          >
            saving...
          </span>
        )}

        {/* Vim toggle */}
        <button
          type="button"
          onClick={() => setVimMode((v) => !v)}
          className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors ${
            vimMode
              ? "bg-violet-900/40 text-violet-400"
              : "bg-stone-800 text-stone-500"
          }`}
          title={vimMode ? "Vim mode ON" : "Vim mode OFF"}
        >
          VIM
        </button>

        {/* Save button */}
        <button
          type="button"
          onClick={() => void handleSave(lastContent)}
          disabled={!dirty || saving}
          className="text-stone-500 hover:text-stone-300 disabled:opacity-30 transition-colors"
          title="Save (Cmd+S)"
          aria-label="Save file"
        >
          <Save size={11} />
        </button>

        {/* Close button */}
        <button
          type="button"
          onClick={handleClose}
          className="text-stone-500 hover:text-stone-300 transition-colors"
          title="Close editor"
          aria-label="Close editor"
        >
          <X size={12} />
        </button>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <CodeEditor
          filePath={openFile}
          content={openFileContent}
          vimMode={vimMode}
          onChange={handleChange}
          onSave={(c) => void handleSave(c)}
        />
      </div>
    </div>
  );
}
