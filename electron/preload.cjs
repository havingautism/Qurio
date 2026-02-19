const { contextBridge, ipcRenderer } = require('electron')

function readArg(prefix) {
  const match = process.argv.find(arg => arg.startsWith(prefix))
  if (!match) return ''
  return match.slice(prefix.length)
}

const backendUrl = readArg('--qurio-backend-url=')

contextBridge.exposeInMainWorld('qurioRuntime', {
  isElectron: true,
  backendUrl,
  selectDirectory: () => ipcRenderer.invoke('qurio:select-directory'),
  selectSqliteFile: () => ipcRenderer.invoke('qurio:select-sqlite-file'),
})
