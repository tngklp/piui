import { app, BrowserWindow, Menu, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import icon from '../../resources/icon.png?asset'
import { registerIpcHandlers } from './ipc'
import { initSdk } from './pi/sdk'

const preloadPath = fileURLToPath(new URL('../preload/index.mjs', import.meta.url))
const rendererEntry = fileURLToPath(new URL('../renderer/index.html', import.meta.url))

/** Content Security Policy applied to packaged builds (dev needs HMR access). */
const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-src 'none'"
].join('; ')

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f0f13',
    title: 'PiUI',
    icon,
    webPreferences: {
      preload: preloadPath,
      // ESM preload scripts must be unsandboxed (Electron requirement).
      // contextIsolation remains enabled, which is the primary renderer boundary.
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.on('ready-to-show', () => window.show())

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  if (devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(rendererEntry)
  }

  mainWindow = window
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  return window
}

let mainWindow: BrowserWindow | null = null

app.whenReady().then(async () => {
  // Removing the application menu also unbinds its accelerators, which lets the
  // renderer own shortcuts such as Ctrl+N and Ctrl+K.
  Menu.setApplicationMenu(null)

  // Prefer the SDK from the installed pi release so both stay in step.
  await initSdk()

  if (app.isPackaged) {
    app.on('web-contents-created', (_event, contents) => {
      contents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [PRODUCTION_CSP]
          }
        })
      })
    })
  }

  registerIpcHandlers({ getWindow: () => mainWindow })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
