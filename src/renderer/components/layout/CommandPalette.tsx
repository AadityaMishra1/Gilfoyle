import React, { useEffect } from "react";
import { Command } from "cmdk";
import {
  Terminal,
  List,
  BarChart2,
  Layout,
  Zap,
  Settings,
  Plus,
  Keyboard,
  Sun,
  Moon,
} from "lucide-react";
import { useUIStore } from "../../stores/ui-store";
import { useLayoutStore } from "../../stores/layout-store";
import { useSettingsStore } from "../../stores/settings-store";

const CommandPalette: React.FC = () => {
  const { commandPaletteOpen, setCommandPaletteOpen, setSettingsOpen } =
    useUIStore();
  const {
    toggleSidebar,
    setActiveInfoTab,
    setSidebarCollapsed,
    setInfoPanelHeight,
  } = useLayoutStore();
  const theme = useSettingsStore((s) => s.theme);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);

  // Escape closes the palette. Cmd+K is handled globally in App.tsx to avoid
  // duplicate registrations causing toggle conflicts.
  useEffect(() => {
    if (!commandPaletteOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  if (!commandPaletteOpen) return null;

  const runAndClose = (fn: () => void) => {
    fn();
    setCommandPaletteOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: "var(--backdrop)" }}
        onClick={() => setCommandPaletteOpen(false)}
      />

      {/* Palette */}
      <div
        className="relative w-full max-w-md rounded-lg shadow-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--bg-sidebar)",
          border: "1px solid var(--border)",
          transition: "background-color 0.2s ease",
        }}
      >
        <Command className="flex flex-col" label="Command Palette">
          <Command.Input
            placeholder="Type a command..."
            className="w-full px-4 py-3 bg-transparent text-sm outline-none"
            style={{
              fontFamily: "'Geist', system-ui, sans-serif",
              borderBottom: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
            autoFocus
          />

          <Command.List className="max-h-[300px] overflow-y-auto p-2">
            <Command.Empty className="text-stone-500 text-xs text-center py-6">
              No results found.
            </Command.Empty>

            <Command.Group
              heading="Layout"
              className="text-stone-500 text-[10px] uppercase tracking-widest px-2 py-1"
            >
              <CommandItem
                icon={<Layout size={14} />}
                label="Simple Layout"
                shortcut="Beginner"
                onSelect={() =>
                  runAndClose(() => {
                    setSidebarCollapsed(true);
                    setInfoPanelHeight(15);
                  })
                }
              />
              <CommandItem
                icon={<Zap size={14} />}
                label="Power Layout"
                shortcut="Bloomberg"
                onSelect={() =>
                  runAndClose(() => {
                    setSidebarCollapsed(false);
                    setInfoPanelHeight(40);
                  })
                }
              />
              <CommandItem
                icon={<List size={14} />}
                label="Toggle Sidebar"
                shortcut="Cmd+\"
                onSelect={() => runAndClose(toggleSidebar)}
              />
            </Command.Group>

            <Command.Group
              heading="Session"
              className="text-stone-500 text-[10px] uppercase tracking-widest px-2 py-1 mt-1"
            >
              <CommandItem
                icon={<Plus size={14} />}
                label="New Session"
                shortcut="Cmd+N"
                onSelect={() =>
                  runAndClose(() => {
                    // Simulate Cmd+N keypress to trigger TerminalArea's handler.
                    window.dispatchEvent(
                      new KeyboardEvent("keydown", {
                        key: "n",
                        metaKey: true,
                        bubbles: true,
                      }),
                    );
                  })
                }
              />
              <CommandItem
                icon={<Terminal size={14} />}
                label="Focus Terminal"
                shortcut="Ctrl+`"
                onSelect={() =>
                  runAndClose(() => {
                    // Focus the active terminal container.
                    const el = document.querySelector<HTMLElement>(
                      '[aria-label="Terminal"]',
                    );
                    el?.focus();
                  })
                }
              />
            </Command.Group>

            <Command.Group
              heading="View"
              className="text-stone-500 text-[10px] uppercase tracking-widest px-2 py-1 mt-1"
            >
              <CommandItem
                icon={<BarChart2 size={14} />}
                label="Show Activity"
                onSelect={() => runAndClose(() => setActiveInfoTab("activity"))}
              />
              <CommandItem
                icon={theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
                label={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
                onSelect={() => runAndClose(toggleTheme)}
              />
              <CommandItem
                icon={<Settings size={14} />}
                label="Open Settings"
                shortcut="Cmd+,"
                onSelect={() => runAndClose(() => setSettingsOpen(true))}
              />
              <CommandItem
                icon={<Keyboard size={14} />}
                label="Keyboard Shortcuts"
                shortcut="Cmd+?"
                onSelect={() =>
                  runAndClose(() => {
                    // TODO: Open a keyboard shortcuts dialog.
                    // For now, a no-op; the tips are shown in onboarding.
                  })
                }
              />
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
};

interface CommandItemProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onSelect: () => void;
}

const CommandItem: React.FC<CommandItemProps> = ({
  icon,
  label,
  shortcut,
  onSelect,
}) => (
  <Command.Item
    className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-stone-300 cursor-pointer transition-colors data-[selected=true]:bg-[rgba(232,168,114,0.12)] data-[selected=true]:text-[#e8a872]"
    onSelect={onSelect}
    value={label}
  >
    <span className="text-stone-500 shrink-0">{icon}</span>
    <span className="flex-1">{label}</span>
    {shortcut && (
      <span
        className="text-stone-600 text-[10px] shrink-0"
        style={{ fontFamily: "'Geist Mono', monospace" }}
      >
        {shortcut}
      </span>
    )}
  </Command.Item>
);

export default CommandPalette;
