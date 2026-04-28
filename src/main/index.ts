import { app, BrowserWindow } from 'electron'
import { chmodSync, mkdirSync } from 'fs'
import { stat } from 'fs/promises'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'
import { IPC_CHANNELS } from '../../shared/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDev = !!process.env.VITE_DEV_SERVER_URL
const OPEN_FILE_DEBOUNCE_MS = 250
const PRIVATE_DIR_MODE = 0o700

let mainWindow: BrowserWindow | null = null
const pendingOpenPaths: string[] = []
let pendingFlushTimer: NodeJS.Timeout | null = null

function ensurePrivateDirectory(dirPath: string): void {
  mkdirSync(dirPath, { recursive: true, mode: PRIVATE_DIR_MODE })

  try {
    chmodSync(dirPath, PRIVATE_DIR_MODE)
  } catch {
    // Keep running even if the host filesystem refuses chmod.
  }
}

function configurePrivateAppPaths(): void {
  const appDataRoot = process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support', app.getName())
    : app.getPath('userData')
  const sessionDataRoot = join(appDataRoot, 'session-data')

  ensurePrivateDirectory(appDataRoot)
  ensurePrivateDirectory(sessionDataRoot)

  app.setPath('userData', appDataRoot)
  app.setPath('sessionData', sessionDataRoot)
}

function createWindow(): BrowserWindow {
  const preloadPath = join(__dirname, '..', 'preload', 'index.cjs')

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Simple Diff',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL!)
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  return win
}

async function flushPendingOpenPaths(): Promise<void> {
  pendingFlushTimer = null
  const paths = pendingOpenPaths.splice(0, pendingOpenPaths.length)
  if (paths.length === 0) return

  const directories: string[] = []
  for (const p of paths) {
    try {
      const info = await stat(p)
      if (info.isDirectory()) directories.push(p)
    } catch {
      // ignore inaccessible paths
    }
  }

  if (directories.length === 0) return

  let win = mainWindow
  if (!win || win.isDestroyed()) {
    win = createWindow()
    mainWindow = win
  }

  const send = (): void => {
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.APP_OPEN_PATHS, directories)
    }
  }

  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', send)
  } else {
    send()
  }
}

function schedulePendingFlush(): void {
  if (pendingFlushTimer) clearTimeout(pendingFlushTimer)
  pendingFlushTimer = setTimeout(() => { void flushPendingOpenPaths() }, OPEN_FILE_DEBOUNCE_MS)
}

// Must register before app.whenReady so cold-start Dock drops are captured.
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  pendingOpenPaths.push(filePath)
  if (app.isReady()) {
    schedulePendingFlush()
  }
})

configurePrivateAppPaths()

app.whenReady().then(async () => {
  const { registerAllHandlers } = await import('./ipc/index')
  registerAllHandlers()
  mainWindow = createWindow()

  if (pendingOpenPaths.length > 0) {
    schedulePendingFlush()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
