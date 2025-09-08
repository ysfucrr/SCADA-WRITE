import { app, BrowserWindow, Menu, Tray, ipcMain, shell } from "electron";
import { fork, spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as url from "url";
import waitOn from "wait-on";
import fs from "fs";
import dotenv from "dotenv";
import treeKill from "tree-kill";
import AutoLaunch from "auto-launch";

let tray: Tray | null;
let isQuiting = false;

const isDev = !app.isPackaged;

const envPath = isDev
  ? path.join(process.cwd(), ".env.local")
  : path.join(process.resourcesPath, "app", ".env.local");

dotenv.config({ path: envPath });

let mainWindow: BrowserWindow | null = null;
let loadingWindow: BrowserWindow | null = null;
let nextProcess: ChildProcess | null = null;
let serviceProcess: ChildProcess | null = null;

// Setup logging
const logsDir = path.join(app.getPath("userData"), "logs");
const logFile = path.join(logsDir, "electron.log");

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const log = (message: string) => {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}\n`;
  fs.appendFileSync(logFile, logMessage, { encoding: "utf8" });
  console.log("log", logMessage.trim());
};

function getAssetPath(...paths: string[]) {
  if (isDev) {
    return path.join(process.cwd(), "assets", ...paths);
  } else {
    return path.join(process.resourcesPath, "assets", ...paths);
  }
}
log("Electron started");

// App base path (prod'da resources/app)
const appPath = isDev ? process.cwd() : path.join(process.resourcesPath, "app");
Menu.buildFromTemplate([])
function createLoadingWindow() {
  log("Creating loading window");
  loadingWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    show: true,
    transparent: true,
    webPreferences: {
      nodeIntegration: true,
    },
  });
  loadingWindow.setResizable(false);
  const loadingPath = url.format({
    pathname: path.join(app.getAppPath(), "electron", "loading.html"),
    protocol: "file:",
    slashes: true,
  });
  loadingWindow.loadURL(loadingPath);
  loadingWindow.on("closed", () => {
    loadingWindow = null;
  });
  loadingWindow.show();
}

async function createWindow() {
  log("Creating window");
  if (process.platform === "darwin" && app.dock) {
    app.dock.hide();
  }
  // Tray icon oluştur
  tray = new Tray(getAssetPath("icons", "task_icon.png"));
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show",
      click: () => {
        mainWindow?.show();
      },
    },
    {
      label: "Exit",
      click: () => {
        isQuiting = true;
        app.quit();
      },
    },
  ]);
  tray.setToolTip("SCADA Multicore");
  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => {
    mainWindow?.show();
  });

  //
  // 1. Service başlat
  //
  // Geliştirme ortamında, bu işlemleri `concurrently` zaten yapıyor.
  // Bu yüzden `electron/main.ts` içinde tekrar başlatmıyoruz.
  if (process.env.NODE_ENV !== "development") {
    const serviceFile = path.join(appPath, "dist-service", "service_bundle.js");

    serviceProcess = fork(serviceFile, [], {
      env: {
        ...process.env,
        NODE_ENV: "production",
        IS_PACKAGED: app.isPackaged ? 'true' : 'false' // isPackaged bilgisini gönder
      },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'], // Stdio'yu yakalamak için 'pipe' kullan
    });

    // Servis sürecinin çıktılarını logla
    serviceProcess.stdout?.on('data', (data) => {
      log(`[Service STDOUT]: ${data.toString()}`);
    });
    
    serviceProcess.stderr?.on('data', (data) => {
      log(`[Service STDERR]: ${data.toString()}`);
    });

    serviceProcess.on('exit', (code) => {
      log(`Service process exited with code: ${code}`);
    });
    serviceProcess.setMaxListeners(30);

    // Üretimde Next.js'i başlat
    nextProcess = fork("server.js", [], {
      cwd: path.join(process.resourcesPath, "app", "next-standalone"),
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production" },
    });
    nextProcess.setMaxListeners(30);
    log("Started production processes.");
  } else {
    log("Development environment detected. Skipping process fork.");
  }

  // Next.js hazır olana kadar bekle
  await waitOn({
    resources: ["http://localhost:3000"],
    timeout: 30000,
  });

  log("Next.js ready");
  
  if (loadingWindow) {
    loadingWindow.close();
  }

  //
  // 3. BrowserWindow
  //
  mainWindow = new BrowserWindow({
    icon: getAssetPath("icons", "task_icon.png"),
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    simpleFullscreen: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      devTools: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);

  // Devtools açma engelle
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (
      (input.control || input.meta) &&
      input.shift &&
      (input.key.toLowerCase() === "i" || input.key.toLowerCase() === "j")
    ) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on("devtools-opened", () => {
    mainWindow!.webContents.closeDevTools();
  });

  const startUrl = "http://localhost:3000";
  await mainWindow.loadURL(startUrl);
  
  mainWindow.show();

  mainWindow.on("close", (event) => {
    if (!isQuiting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  (mainWindow as any).on("minimize", (event: any) => {
    event.preventDefault();
    mainWindow?.hide();
  });
}

//
// Electron lifecycle
//
app.whenReady().then(() => {
  createLoadingWindow();
  if (!isDev) {
    const autoLaunch = new AutoLaunch({
      name: "SCADA Multicore",
      path: app.getPath("exe"),
    });
    autoLaunch.isEnabled().then((isEnabled) => {
      if (!isEnabled) autoLaunch.enable();
    });
  }
  setTimeout(() => {
    createWindow();
  }, 100);

  ipcMain.handle('open-external-link', (event, url) => {
    shell.openExternal(url);
  });
});

function stopProcesses() {
  try {
    if (nextProcess) {
      log("Killing Next.js process: " + nextProcess!.pid!);
      treeKill(nextProcess!.pid!, "SIGKILL");
      nextProcess = null;
    }
    if (serviceProcess) {
      log("Killing Service process: " + serviceProcess!.pid!);
      treeKill(serviceProcess!.pid!, "SIGKILL");
      serviceProcess = null;
    }
  } catch (err) {
    console.error("Kill error:", err);
  }
}

app.on("window-all-closed", () => {
  stopProcesses();
  app.quit();
});

app.on("before-quit", () => {
  isQuiting = true;
  stopProcesses();
});

app.on("quit", () => {
  stopProcesses();
});

app.on("activate", () => {
  if (mainWindow === null) {
    log("Activating window");
    createWindow();
  } else {
    mainWindow.show();
  }
});