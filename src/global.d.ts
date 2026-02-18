export {}

declare global {
  interface Window {
    __qurioRuntimeRecoveryBound?: boolean
    qurioRuntime?: {
      isElectron?: boolean
      backendUrl?: string
      selectDirectory?: () => Promise<string>
      selectSqliteFile?: () => Promise<string>
    }
  }
}
