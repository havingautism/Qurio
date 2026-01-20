//! Tauri Development Script - Node.js Backend Mode
//! Starts the Node.js backend (port 3002) + frontend dev server, then launches Tauri app

import { spawn } from 'node:child_process'
import net from 'node:net'

const isPortOpen = (host, port, timeoutMs = 800) =>
  new Promise(resolve => {
    const socket = net.createConnection({ host, port })
    const done = open => {
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })

const waitForPort = (host, port, timeoutMs = 60000, intervalMs = 500) =>
  new Promise((resolve, reject) => {
    const start = Date.now()
    const tryConnect = () => {
      const socket = net.createConnection({ host, port })
      socket.once('connect', () => {
        socket.end()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for ${host}:${port}`))
          return
        }
        setTimeout(tryConnect, intervalMs)
      })
    }
    tryConnect()
  })

const spawnBackground = (command, args, env = {}) => {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    detached: true,
    env: { ...process.env, ...env },
  })
  child.unref()
  return child
}

const terminate = child => {
  if (!child || child.killed) return
  child.kill('SIGTERM')
}

const main = async () => {
  const frontendPort = 3000
  const backendPort = 3002 // Node.js backend port
  const frontendHost = 'localhost'

  console.log('[Node.js Mode] Starting Tauri development with Node.js backend...')
  console.log(`[Node.js Mode] Frontend: http://${frontendHost}:${frontendPort}`)
  console.log(`[Node.js Mode] Backend:  http://${frontendHost}:${backendPort}`)

  // Check if Node backend is already running
  const backendRunning = await isPortOpen(frontendHost, backendPort)
  if (backendRunning) {
    console.log('[Node.js Mode] Node.js backend already running on port 3002')
  } else {
    console.log('[Node.js Mode] Starting Node.js backend on port 3002...')
    const backendProcess = spawnBackground('bun', ['run', 'dev:backend'], {
      PORT: backendPort,
      NODE_BACKEND_PORT: String(backendPort),
    })
    backendProcess.on('exit', code => {
      if (code !== null && code !== 0) {
        console.error('[Node.js Mode] Backend process exited with code', code)
      }
    })
  }

  // Start frontend dev server with Node backend URL
  console.log('[Node.js Mode] Starting frontend dev server...')
  const frontendProcess = spawnBackground('bun', ['run', 'dev:tauri'], {
    PUBLIC_BACKEND_URL: `http://${frontendHost}:${backendPort}`,
  })

  try {
    // Wait for frontend to be ready
    console.log('[Node.js Mode] Waiting for frontend to be ready...')
    await waitForPort(frontendHost, frontendPort)
    console.log('[Node.js Mode] Frontend ready!')
    console.log('[Node.js Mode] Run `tauri dev` in another terminal to launch the desktop app.')
    console.log('[Node.js Mode] Or use: bun run tauri:dev')
  } catch (err) {
    console.error('[Node.js Mode]', err.message)
    terminate(frontendProcess)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('[Node.js Mode]', err)
  process.exit(1)
})
