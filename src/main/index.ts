import { app, BrowserWindow, Menu, net, protocol, shell } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import icon from '../../assets/icon.png?asset'
import { registerIpcHandlers } from './ipc'
import { disposeUndoHistory } from './fs-ops'
import { initSdk } from './pi/sdk'

const preloadPath = fileURLToPath(new URL('../preload/index.mjs', import.meta.url))
const rendererEntry = fileURLToPath(new URL('../renderer/index.html', import.meta.url))

/**
 * Scheme used to stream local files into the renderer.
 *
 * The editor can show images and PDFs, which the file IPC cannot carry: it is
 * text-only. A protocol keeps them out of JavaScript entirely and lets Chromium
 * issue range requests, so a large PDF is not read into memory first.
 */
const FILE_SCHEME = 'piui-file'

// Has to run before the app is ready. `standard` gives the URL a host and a
// query string the handler can parse; `stream` keeps responses out of memory.
protocol.registerSchemesAsPrivileged([
  {
    scheme: FILE_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

/** Content Security Policy applied to packaged builds (dev needs HMR access). */
const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${FILE_SCHEME}:`,
  "font-src 'self' data:",
  "connect-src 'self'",
  // The PDF viewer is an internal plugin, so `object-src` has to allow it.
  `object-src 'self' ${FILE_SCHEME}:`,
  "base-uri 'self'",
  `frame-src 'self' ${FILE_SCHEME}:`
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
      nodeIntegration: false,
      // Required for Chromium's built-in PDF viewer, which renders the `<embed>`
      // the editor uses for PDF files.
      plugins: true
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

  // The path travels as a query parameter, so no separator or drive letter has
  // to survive URL parsing on its way through the protocol layer.
  protocol.handle(FILE_SCHEME, async (request) => {
    const target = new URL(request.url).searchParams.get('path')
    if (!target) return new Response('Missing path', { status: 400 })

    try {
      return await net.fetch(pathToFileURL(target).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Deleted files are parked so they can be restored; the parked copies only mean
// anything while this process is alive to restore them.
app.on('will-quit', () => {
  void disposeUndoHistory()
})
