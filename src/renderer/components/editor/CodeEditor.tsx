import React, { useEffect, useRef, useCallback } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, indentWithTab, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching, foldGutter, indentOnInput } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { vim } from "@replit/codemirror-vim";
import { oneDark } from "@codemirror/theme-one-dark";

// ─── Language detection ───────────────────────────────────────────────────────

function getLanguageExtension(filePath: string) {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return javascript();
    case "ts":
    case "tsx":
    case "mts":
      return javascript({ typescript: true, jsx: ext.includes("x") });
    case "html":
    case "htm":
    case "svelte":
    case "vue":
      return html();
    case "css":
    case "scss":
    case "less":
      return css();
    case "py":
    case "pyw":
      return python();
    case "json":
    case "jsonc":
      return json();
    case "md":
    case "mdx":
    case "markdown":
      return markdown();
    default:
      return [];
  }
}

// ─── Warm dark theme ──────────────────────────────────────────────────────────

const warmDark = EditorView.theme(
  {
    "&": {
      backgroundColor: "#171412",
      color: "#d6d3d1",
      fontSize: "12px",
      fontFamily: "'Geist Mono', monospace",
    },
    ".cm-content": {
      caretColor: "#e8a872",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#e8a872",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      {
        backgroundColor: "#44403c",
      },
    ".cm-gutters": {
      backgroundColor: "#1c1917",
      color: "#57534e",
      border: "none",
      borderRight: "1px solid #292524",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#292524",
      color: "#a8a29e",
    },
    ".cm-activeLine": {
      backgroundColor: "#1c191780",
    },
    ".cm-foldGutter": {
      color: "#57534e",
    },
    // Vim status bar
    ".cm-vim-panel": {
      backgroundColor: "#1c1917",
      color: "#a8a29e",
      fontFamily: "'Geist Mono', monospace",
      fontSize: "11px",
      padding: "2px 8px",
      borderTop: "1px solid #292524",
    },
    ".cm-fat-cursor": {
      backgroundColor: "#e8a87280 !important",
    },
  },
  { dark: true },
);

// ─── Component ────────────────────────────────────────────────────────────────

interface CodeEditorProps {
  filePath: string;
  content: string;
  vimMode: boolean;
  onChange: (content: string) => void;
  onSave: (content: string) => void;
}

export function CodeEditor({
  filePath,
  content,
  vimMode,
  onChange,
  onSave,
}: CodeEditorProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  const saveKeymap = useCallback(
    () =>
      keymap.of([
        {
          key: "Mod-s",
          run: (view) => {
            onSaveRef.current(view.state.doc.toString());
            return true;
          },
        },
      ]),
    [],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const extensions = [
      lineNumbers(),
      highlightActiveLine(),
      bracketMatching(),
      foldGutter(),
      indentOnInput(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      saveKeymap(),
      warmDark,
      oneDark,
      getLanguageExtension(filePath),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
    ];

    if (vimMode) {
      extensions.unshift(vim());
    }

    const state = EditorState.create({
      doc: content,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Recreate editor when filePath or vimMode changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, vimMode]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden"
      style={{ backgroundColor: "#171412" }}
    />
  );
}
