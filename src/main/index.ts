import { app, BrowserWindow, shell } from "electron";
import path from "path";
import os from "os";
import fs from "fs";
import { PtyManager } from "./pty/pty-manager";
import { registerIpcHandlers } from "./ipc/handlers";
import { buildMenu } from "./menu";
import { OAuthUsageService } from "./services/oauth-usage";

// electron-vite sets this env var during development.

// ─── Window state persistence ─────────────────────────────────────────────

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized?: boolean;
}

function getWindowStatePath(): string {
  return path.join(os.homedir(), ".gilfoyle", "window-state.json");
}

function loadWindowState(): WindowState {
  try {
    const filePath = getWindowStatePath();
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as WindowState;
      if (data.width > 0 && data.height > 0) return data;
    }
  } catch {
    // Non-fatal — use defaults
  }
  return { width: 1400, height: 900 };
}

function saveWindowState(win: BrowserWindow): void {
  try {
    const bounds = win.getBounds();
    const state: WindowState = {
      ...bounds,
      isMaximized: win.isMaximized(),
    };
    const dir = path.dirname(getWindowStatePath());
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(state), "utf8");
  } catch {
    // Non-fatal
  }
}

// ─── State ────────────────────────────────────────────────────────────────

const ptyManager = new PtyManager();
let mainWindow: BrowserWindow | null = null;
// Singleton — must survive window re-creation and HMR to avoid duplicate polling.
let oauthUsage: OAuthUsageService | null = null;

// ─── Window factory ───────────────────────────────────────────────────────

function createMainWindow(): BrowserWindow {
  const isMac = process.platform === "darwin";
  const savedState = loadWindowState();

  const win = new BrowserWindow({
    width: savedState.width,
    height: savedState.height,
    ...(savedState.x !== undefined && savedState.y !== undefined
      ? { x: savedState.x, y: savedState.y }
      : {}),
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

  if (savedState.isMaximized) {
    win.maximize();
  }

  // Persist window bounds on move/resize (debounced via 500ms timer).
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!win.isDestroyed() && !win.isMinimized()) {
        saveWindowState(win);
      }
    }, 500);
  };
  win.on("resize", debouncedSave);
  win.on("move", debouncedSave);

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
