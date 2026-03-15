import { describe, expect, test } from 'bun:test'
import {
  resolveDefaultAgentStartupAction,
  resolveDeepResearchAgentStartupAction,
} from './systemAgentStartupPolicy'

describe('systemAgentStartupPolicy', () => {
  test('creates default agent only when missing', () => {
    expect(resolveDefaultAgentStartupAction(null)).toBe('create')
    expect(resolveDefaultAgentStartupAction({ id: '11111111-1111-1111-1111-111111111111' })).toBe(
      'reuse',
    )
  })

  test('never auto-creates deep research agent on startup', () => {
    expect(resolveDeepResearchAgentStartupAction(null)).toBe('reuse')
    expect(
      resolveDeepResearchAgentStartupAction({ id: '22222222-2222-2222-2222-222222222222' }),
    ).toBe('reuse')
  })
})
