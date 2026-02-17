const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const http = require('node:http')
const { spawn } = require('node:child_process')

const isDev = !app.isPackaged
const backendHost = '127.0.0.1'
const backendPort = 3002
let backendProcess = null

function resolveBackendCommand() {
  if (!isDev) {
    const backendExe = path.join(process.resourcesPath, 'backend', 'QurioBackend.exe')
    if (!fs.existsSync(backendExe)) {
      throw new Error(`Backend executable not found: ${backendExe}`)
    }
    return { command: backendExe, args: [] }
  }

  // Dev mode: start python backend through uv.
  return {
    command: 'uv',
    args: ['run', 'python', 'run.py'],
    cwd: path.join(__dirname, '..', 'backend-python'),
  }
}

function startBackend() {
  const cmd = resolveBackendCommand()
  backendProcess = spawn(cmd.command, cmd.args, {
    cwd: cmd.cwd || undefined,
    env: {
      ...process.env,
      HOST: backendHost,
      PORT: String(backendPort),
      FRONTEND_URLS: 'http://localhost:3000,null',
      QURIO_ELECTRON: '1',
      QURIO_CONFIG_DIR: app.getPath('userData'),
    },
    stdio: 'inherit',
    windowsHide: true,
  })

  backendProcess.on('exit', code => {
    backendProcess = null
    if (!app.isQuitting) {
      console.error(`[electron] Python backend exited unexpectedly (code=${code})`)
    }
  })
}

function waitForBackendReady(timeoutMs = 20000) {
  const startedAt = Date.now()

  return new Promise(resolve => {
    const probe = () => {
      const req = http.get(
        `http://${backendHost}:${backendPort}/api/health`,
        { timeout: 1200 },
        res => {
          res.resume()
          if (res.statusCode && res.statusCode < 500) {
            resolve(true)
            return
          }
          if (Date.now() - startedAt > timeoutMs) {
            resolve(false)
            return
          }
          setTimeout(probe, 500)
        },
      )

      req.on('error', () => {
        if (Date.now() - startedAt > timeoutMs) {
          resolve(false)
          return
        }
        setTimeout(probe, 500)
      })

      req.on('timeout', () => {
        req.destroy()
      })
    }

    probe()
  })
}

function stopBackend() {
  if (!backendProcess) return
  try {
    backendProcess.kill()
  } catch (error) {
    console.error('[electron] Failed to stop Python backend:', error)
  }
  backendProcess = null
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:3000')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
    win.loadFile(indexPath)
  }
}

app.on('before-quit', () => {
  app.isQuitting = true
  stopBackend()
})

app.whenReady().then(() => {
  startBackend()
  waitForBackendReady().finally(() => {
    createWindow()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
