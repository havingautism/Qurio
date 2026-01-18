import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'

const parseEnvFile = filePath => {
  if (!fs.existsSync(filePath)) return {}
  const env = {}
  const content = fs.readFileSync(filePath, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eqIndex = line.indexOf('=')
    if (eqIndex === -1) continue
    const key = line.slice(0, eqIndex).trim()
    let value = line.slice(eqIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key) env[key] = value
  }
  return env
}

const rootDir = process.cwd()
const backendDir = path.join(rootDir, 'backend')
const envFromFiles = {
  ...parseEnvFile(path.join(backendDir, '.env')),
  ...parseEnvFile(path.join(backendDir, '.env.local')),
  ...parseEnvFile(path.join(rootDir, '.env')),
  ...parseEnvFile(path.join(rootDir, '.env.local')),
}
const effectiveEnv = { ...envFromFiles, ...process.env }

const resolveBackendTarget = () => {
  if (effectiveEnv.PUBLIC_BACKEND_URL) {
    try {
      const url = new URL(effectiveEnv.PUBLIC_BACKEND_URL)
      return { host: url.hostname, port: Number(url.port || 80) }
    } catch {
      // Ignore invalid URL and fall back to host/port vars.
    }
  }
  const host =
    effectiveEnv.BACKEND_HOST ||
    effectiveEnv.HOST ||
    '127.0.0.1'
  const port = Number(effectiveEnv.BACKEND_PORT || effectiveEnv.PORT || 3001)
  return { host, port }
}

const resolveFrontendTarget = () => {
  if (effectiveEnv.PUBLIC_FRONTEND_URL) {
    try {
      const url = new URL(effectiveEnv.PUBLIC_FRONTEND_URL)
      return { host: url.hostname, port: Number(url.port || 3000) }
    } catch {
      // Ignore invalid URL and fall back to defaults.
    }
  }
  const host = effectiveEnv.FRONTEND_HOST || '198.18.0.1'
  const port = Number(effectiveEnv.FRONTEND_PORT || 3000)
  return { host, port }
}

const { host: backendHost, port: backendPort } = resolveBackendTarget()
const { host: frontendHost, port: frontendPort } = resolveFrontendTarget()

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

const spawnCommand = (command, args, options = {}) =>
  spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  })

const spawnBackground = (command, args) => {
  const child = spawn(command, args, {
    stdio: 'ignore',
    shell: process.platform === 'win32',
    detached: true,
  })
  child.unref()
  return child
}

const terminate = child => {
  if (!child || child.killed) return
  child.kill('SIGTERM')
}

const main = async () => {
  const prepareOnly = process.argv.includes('--prepare-only')
  const backendRunning = await isPortOpen(backendHost, backendPort)
  const frontendRunning = await isPortOpen(frontendHost, frontendPort)

  const backendProcess = backendRunning ? null : spawnBackground('bun', ['run', 'dev:backend'])
  const frontendProcess = frontendRunning ? null : spawnBackground('bun', ['run', 'dev:tauri'])

  if (backendProcess) {
    backendProcess.on('exit', code => {
      if (code !== null && code !== 0) {
        process.exit(code)
      }
    })
  }

  const waits = []
  if (!backendRunning) waits.push(waitForPort(backendHost, backendPort))
  if (!frontendRunning) waits.push(waitForPort(frontendHost, frontendPort))

  Promise.all(waits)
    .then(() => {
      if (prepareOnly) return
      console.log('Frontend/backend ready. Run `tauri dev` to launch the desktop app.')
    })
    .catch(err => {
      console.error(err.message)
      terminate(frontendProcess)
      terminate(backendProcess)
      process.exit(1)
    })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
