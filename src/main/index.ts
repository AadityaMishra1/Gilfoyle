import { app, BrowserWindow, shell } from "electron";
import path from "path";
import os from "os";
import { PtyManager } from "./pty/pty-manager";
import { registerIpcHandlers } from "./ipc/handlers";
import { buildMenu } from "./menu";
import { OAuthUsageService } from "./services/oauth-usage";

// electron-vite sets this env var during development.

// ─── State ────────────────────────────────────────────────────────────────

const ptyManager = new PtyManager();
let mainWindow: BrowserWindow | null = null;
// Singleton — must survive window re-creation and HMR to avoid duplicate polling.
let oauthUsage: OAuthUsageService | null = null;

// ─── Window factory ───────────────────────────────────────────────────────

function createMainWindow(): BrowserWindow {
  const isMac = process.platform === "darwin";

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#171412", // warm dark — prevents white flash on load
    show: false, // Reveal after content is ready to avoid blank flash
    titleBarStyle: isMac ? "hiddenInset" : "default",
    // On Windows/Linux we keep default title bar so window controls are visible.
    frame: !isMac ? true : undefined,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for node-pty IPC in preload
      webSecurity: !isDev(),
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  });

  // Show only once the renderer has painted — avoids visible loading state.
  win.once("ready-to-show", () => {
    win.show();
    win.focus();
    // if (isDev()) win.webContents.openDevTools({ mode: "detach" });
  });

  // Open external links in the system browser, not inside Electron.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Load renderer.
  if (isDev() && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  return win;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function isDev(): boolean {
  return !app.isPackaged;
}

// ─── App lifecycle ────────────────────────────────────────────────────────

app.whenReady().then(() => {
  mainWindow = createMainWindow();

  const homeDir = os.homedir();
  const dataDir = path.join(homeDir, ".gilfoyle");

  // Create the OAuth service ONCE — reuse across window re-creations.
  if (!oauthUsage) {
    oauthUsage = new OAuthUsageService(dataDir);
  }

  registerIpcHandlers(ptyManager, mainWindow, homeDir, oauthUsage);
  buildMenu(mainWindow);

  // macOS: re-create the window when the dock icon is clicked and no windows
  // are open (standard macOS convention).
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
      registerIpcHandlers(ptyManager, mainWindow, homeDir, oauthUsage!);
      buildMenu(mainWindow);
    }
  });
});

// Windows / Linux: quit when all windows are closed.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    ptyManager.destroyAll();
    app.quit();
  }
});

// Clean up PTY sessions before the process exits.
app.on("before-quit", () => {
  ptyManager.destroyAll();
});
