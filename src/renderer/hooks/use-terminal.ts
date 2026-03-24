import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { useSettingsStore } from "../stores/settings-store";
import "@xterm/xterm/css/xterm.css";

export interface UseTerminalReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  terminal: Terminal | null;
  fitAddon: FitAddon | null;
  searchAddon: SearchAddon | null;
  fit: () => void;
}

const DARK_THEME = {
  background: "#171412",
  foreground: "#fafaf9",
  cursor: "#e8a872",
  cursorAccent: "#171412",
  selectionBackground: "rgba(232, 168, 114, 0.25)",
  selectionForeground: "#fafaf9",
  black: "#1c1917",
  red: "#f87171",
  green: "#86efac",
  yellow: "#e8a872",
  blue: "#93c5fd",
  magenta: "#d8b4fe",
  cyan: "#67e8f9",
  white: "#e7e5e4",
  brightBlack: "#44403c",
  brightRed: "#fca5a5",
  brightGreen: "#bbf7d0",
  brightYellow: "#f0c59c",
  brightBlue: "#bfdbfe",
  brightMagenta: "#ede9fe",
  brightCyan: "#a5f3fc",
  brightWhite: "#fafaf9",
};

const LIGHT_THEME = {
  background: "#fafaf9",
  foreground: "#1c1917",
  cursor: "#c2782a",
  cursorAccent: "#fafaf9",
  selectionBackground: "rgba(194, 120, 42, 0.2)",
  selectionForeground: "#1c1917",
  black: "#1c1917",
  red: "#dc2626",
  green: "#16a34a",
  yellow: "#c2782a",
  blue: "#2563eb",
  magenta: "#9333ea",
  cyan: "#0891b2",
  white: "#f5f5f4",
  brightBlack: "#78716c",
  brightRed: "#ef4444",
  brightGreen: "#22c55e",
  brightYellow: "#d97706",
  brightBlue: "#3b82f6",
  brightMagenta: "#a855f7",
  brightCyan: "#06b6d4",
  brightWhite: "#fafaf9",
};

export function useTerminal(): UseTerminalReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);

  // Use STATE (not ref) so downstream effects re-run when terminal is ready
  const [terminal, setTerminal] = useState<Terminal | null>(null);

  const theme = useSettingsStore((s) => s.theme);

  // Create terminal ONCE — no theme in deps
  useEffect(() => {
    if (!containerRef.current) return;

    const initialTheme =
      useSettingsStore.getState().theme === "light" ? LIGHT_THEME : DARK_THEME;

    const term = new Terminal({
      fontSize: 14,
      lineHeight: 1.4,
      fontFamily:
        "'Geist Mono', 'Symbols Nerd Font Mono', 'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
      theme: initialTheme,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 5000,
      allowProposedApi: true,
      smoothScrollDuration: 80,
      convertEol: false,
      allowTransparency: false,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(searchAddon);

    term.open(containerRef.current);

    // Let app-level shortcuts (Cmd+K, Cmd+T, Cmd+W, Cmd+N, Cmd+\) bubble
    // to window instead of being swallowed by xterm's key handler.
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && ["k", "t", "w", "n", "\\"].includes(event.key)) {
        return false;
      }
      return true;
    });

    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // Initial fit + focus after the DOM settles
    requestAnimationFrame(() => {
      fitAddon.fit();
      term.focus();
    });

    // Trigger re-render so TerminalPanel's effects can wire up PTY I/O
    setTerminal(term);

    return () => {
      term.dispose();
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      setTerminal(null);
    };
    // Only run once on mount — theme updates are handled separately below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update theme IN-PLACE without destroying the terminal instance.
  // This preserves the PTY connection, scrollback, and all listeners.
  useEffect(() => {
    if (!terminal) return;
    terminal.options.theme = theme === "light" ? LIGHT_THEME : DARK_THEME;
  }, [terminal, theme]);

  const fit = useCallback(() => {
    fitAddonRef.current?.fit();
  }, []);

  return {
    containerRef,
    terminal,
    fitAddon: fitAddonRef.current,
    searchAddon: searchAddonRef.current,
    fit,
  };
}
