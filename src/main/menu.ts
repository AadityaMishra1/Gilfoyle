import {
  app,
  Menu,
  MenuItem,
  BrowserWindow,
  shell,
  MenuItemConstructorOptions,
} from "electron";

/**
 * Builds and sets the application menu.
 *
 * @param mainWindow - Reference to the primary BrowserWindow so menu actions
 *   can target it. Pass null/undefined when called before the window exists;
 *   in that case window-specific items are no-ops.
 */
export function buildMenu(mainWindow: BrowserWindow | null): void {
  const isMac = process.platform === "darwin";

  const sendToRenderer = (channel: string, ...args: unknown[]): void => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, ...args);
    }
  };

  // ─── macOS "App" menu ───────────────────────────────────────────────────
  const appMenu: MenuItemConstructorOptions = {
    label: app.name,
    submenu: [
      { role: "about" },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  };

  // ─── File menu ──────────────────────────────────────────────────────────
  const fileMenu: MenuItemConstructorOptions = {
    label: "File",
    submenu: [
      {
        label: "New Session",
        accelerator: "CmdOrCtrl+N",
        click(): void {
          sendToRenderer("menu:new-session");
        },
      },
      {
        label: "Close Tab",
        accelerator: "CmdOrCtrl+W",
        click(): void {
          sendToRenderer("menu:close-tab");
        },
      },
      { type: "separator" },
      isMac ? { role: "close" } : { role: "quit" },
    ],
  };

  // ─── Edit menu ──────────────────────────────────────────────────────────
  const editMenu: MenuItemConstructorOptions = {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      ...(isMac
        ? [
            { role: "pasteAndMatchStyle" as const },
            { role: "delete" as const },
            { role: "selectAll" as const },
            { type: "separator" as const },
            {
              label: "Speech",
              submenu: [
                { role: "startSpeaking" as const },
                { role: "stopSpeaking" as const },
              ],
            },
          ]
        : [
            { role: "delete" as const },
            { type: "separator" as const },
            { role: "selectAll" as const },
          ]),
    ],
  };

  // ─── View menu ──────────────────────────────────────────────────────────
  const viewMenu: MenuItemConstructorOptions = {
    label: "View",
    submenu: [
      {
        label: "Toggle Sidebar",
        accelerator: "CmdOrCtrl+\\",
        click(): void {
          sendToRenderer("menu:toggle-sidebar");
        },
      },
      {
        label: "Command Palette",
        accelerator: "CmdOrCtrl+K",
        click(): void {
          sendToRenderer("menu:command-palette");
        },
      },
      { type: "separator" },
      { role: "reload" },
      { role: "forceReload" },
      {
        label: "Toggle Developer Tools",
        accelerator: isMac ? "Alt+Cmd+I" : "Ctrl+Shift+I",
        click(): void {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.toggleDevTools();
          }
        },
      },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  };

  // ─── Window menu ────────────────────────────────────────────────────────
  const windowMenu: MenuItemConstructorOptions = {
    label: "Window",
    submenu: [
      { role: "minimize" },
      { role: "zoom" },
      ...(isMac
        ? [
            { type: "separator" as const },
            { role: "front" as const },
            { type: "separator" as const },
            { role: "window" as const },
          ]
        : [{ role: "close" as const }]),
    ],
  };

  // ─── Help menu ──────────────────────────────────────────────────────────
  const helpMenu: MenuItemConstructorOptions = {
    role: "help",
    submenu: [
      {
        label: "Documentation",
        click(): void {
          shell.openExternal(
            "https://docs.anthropic.com/en/docs/claude-code/overview",
          );
        },
      },
      {
        label: "Report an Issue",
        click(): void {
          shell.openExternal(
            "https://github.com/anthropics/claude-code/issues",
          );
        },
      },
      { type: "separator" },
      {
        label: "About Gilfoyle",
        click(): void {
          if (mainWindow && !mainWindow.isDestroyed()) {
            app.showAboutPanel();
          }
        },
      },
    ],
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [appMenu] : []),
    fileMenu,
    editMenu,
    viewMenu,
    windowMenu,
    helpMenu,
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
