import { beforeEach, describe, expect, test } from 'bun:test'

import { loadSettings, saveSettings } from './settings'

const createStorage = () => {
  const store = new Map()
  return {
    getItem: key => (store.has(String(key)) ? store.get(String(key)) : null),
    setItem: (key, value) => {
      store.set(String(key), String(value))
    },
    removeItem: key => {
      store.delete(String(key))
    },
    clear: () => store.clear(),
  }
}

describe('settings db access key persistence', () => {
  beforeEach(() => {
    globalThis.localStorage = createStorage()
    globalThis.sessionStorage = createStorage()
    globalThis.window = {
      dispatchEvent: () => {},
      location: { protocol: 'http:', search: '' },
      qurioRuntime: {},
    }
    globalThis.navigator = { userAgent: 'bun-test' }
  })

  test('saveSettings keeps dbAccessKey in localStorage across loadSettings', async () => {
    await saveSettings({
      dbAccessKey: 'secret-db-key',
      contextTurns: 12,
    })

    expect(localStorage.getItem('dbAccessKey')).toBe('secret-db-key')

    const settings = loadSettings()

    expect(settings.dbAccessKey).toBe('secret-db-key')
    expect(localStorage.getItem('dbAccessKey')).toBe('secret-db-key')
  })
})
