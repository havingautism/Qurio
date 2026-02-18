const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const http = require('node:http')
const net = require('node:net')
const { spawn, spawnSync } = require('node:child_process')

const isDev = !app.isPackaged
const backendHost = '127.0.0.1'
let backendPort = 3002
const frontendHost = '127.0.0.1'
let frontendPort = 3000
const BACKEND_STARTUP_MARKER = 'Application startup complete.'
let backendProcess = null
let webProcess = null
let backendStartupLogged = false

ipcMain.handle('qurio:select-directory', async () => {
  const focusedWindow = BrowserWindow.getFocusedWindow() || null
  const result = await dialog.showOpenDialog(focusedWindow, {
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || !result.filePaths?.length) return ''
  return result.filePaths[0]
})

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
  const frontendOrigins = [
    `http://${frontendHost}:${frontendPort}`,
    `http://localhost:${frontendPort}`,
    'null',
  ]
  backendProcess = spawn(cmd.command, cmd.args, {
    cwd: cmd.cwd || undefined,
    env: {
      ...process.env,
      HOST: backendHost,
      PORT: String(backendPort),
      FRONTEND_URLS: frontendOrigins.join(','),
      QURIO_ELECTRON: '1',
      QURIO_CONFIG_DIR: app.getPath('userData'),
      BACKEND_RELOAD: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  const handleBackendOutput = (chunk, writer) => {
    const text = chunk.toString()
    writer(text)
    if (!backendStartupLogged && text.includes(BACKEND_STARTUP_MARKER)) {
      backendStartupLogged = true
    }
  }

  backendProcess.stdout?.on('data', chunk => handleBackendOutput(chunk, data => process.stdout.write(data)))
  backendProcess.stderr?.on('data', chunk => handleBackendOutput(chunk, data => process.stderr.write(data)))

  backendProcess.on('exit', code => {
    backendProcess = null
    if (!app.isQuitting) {
      console.error(`[electron] Python backend exited unexpectedly (code=${code})`)
    }
  })
}

function killProcessTreeByPid(pid) {
  if (!pid) return
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      })
    } else {
      process.kill(pid, 'SIGTERM')
    }
  } catch (error) {
    console.error(`[electron] Failed to kill pid ${pid}:`, error)
  }
}

function isPortAvailable(host, port) {
  return new Promise(resolve => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, host)
  })
}

async function findAvailablePort(host, preferredPort, maxAttempts = 50) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const candidate = preferredPort + i
    // eslint-disable-next-line no-await-in-loop
    const available = await isPortAvailable(host, candidate)
    if (available) return candidate
  }
  throw new Error(`Unable to find available port from ${preferredPort} after ${maxAttempts} attempts`)
}

function startWebDevServer() {
  if (!isDev || webProcess) return

  webProcess = spawn('bun', ['run', 'dev:web', '--', '--port', String(frontendPort)], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  webProcess.stdout?.on('data', chunk => process.stdout.write(chunk.toString()))
  webProcess.stderr?.on('data', chunk => process.stderr.write(chunk.toString()))

  webProcess.on('exit', code => {
    webProcess = null
    if (!app.isQuitting) {
      console.error(`[electron] Frontend dev server exited unexpectedly (code=${code})`)
      app.quit()
    }
  })
}

function waitForHttpReady(url, timeoutMs = 20000) {
  const startedAt = Date.now()

  return new Promise(resolve => {
    const probe = () => {
      const req = http.get(url, { timeout: 1200 }, res => {
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
      })

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

async function waitForBackendReady(timeoutMs = 30000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (backendStartupLogged) return true
    const healthOk = await waitForHttpReady(`http://${backendHost}:${backendPort}/api/health`, 1500)
    if (healthOk) return true
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  return false
}

function waitForFrontendReady(timeoutMs = 30000) {
  return waitForHttpReady(`http://${frontendHost}:${frontendPort}`, timeoutMs)
}

function stopChildProcess(child) {
  if (!child) return
  const pid = child.pid
  killProcessTreeByPid(pid)
}

function stopBackend() {
  if (!backendProcess) return
  stopChildProcess(backendProcess)
  backendProcess = null
  backendStartupLogged = false
}

function stopWebDevServer() {
  if (!webProcess) return
  stopChildProcess(webProcess)
  webProcess = null
}

function createWindow() {
  const runtimeBackendUrl = `http://${backendHost}:${backendPort}`
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: [`--qurio-backend-url=${runtimeBackendUrl}`],
    },
  })

  if (isDev) {
    win.loadURL(`http://${frontendHost}:${frontendPort}`)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
    win.loadFile(indexPath)
  }
}

app.on('before-quit', () => {
  app.isQuitting = true
  stopWebDevServer()
  stopBackend()
})

app.whenReady().then(async () => {
  const resolvedBackendPort = await findAvailablePort(backendHost, 3002, 80)
  backendPort = resolvedBackendPort
  if (backendPort !== 3002) {
    console.warn(`[electron] Backend port 3002 is in use, switched to ${backendPort}`)
  }

  if (isDev) {
    const resolvedFrontendPort = await findAvailablePort(frontendHost, 3000, 80)
    frontendPort = resolvedFrontendPort
    if (frontendPort !== 3000) {
      console.warn(`[electron] Frontend port 3000 is in use, switched to ${frontendPort}`)
    }
  }

  startBackend()
  const backendReady = await waitForBackendReady()
  if (!backendReady) {
    console.error('[electron] Backend failed to become ready before timeout')
  }

  if (isDev) {
    startWebDevServer()
    const frontendReady = await waitForFrontendReady()
    if (!frontendReady) {
      console.error('[electron] Frontend dev server failed to become ready before timeout')
    }
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
