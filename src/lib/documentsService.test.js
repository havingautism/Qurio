import { describe, expect, test } from 'bun:test'
import { setConversationDocuments } from './documentsService'

const createSupabaseStub = ({ releaseFirstDelete = null } = {}) => {
  const ops = []
  let deleteCount = 0
  let resolveFirstDeleteStarted
  const firstDeleteStarted = new Promise(resolve => {
    resolveFirstDeleteStarted = resolve
  })

  const builder = {
    delete() {
      return {
        eq: async (column, value) => {
          deleteCount += 1
          ops.push({ kind: 'delete', column, value, deleteCount })
          if (deleteCount === 1) {
            resolveFirstDeleteStarted()
          }
          if (deleteCount === 1 && releaseFirstDelete) {
            await releaseFirstDelete
          }
          return { error: null }
        },
      }
    },
    upsert: async (rows, options) => {
      ops.push({ kind: 'upsert', rows, options })
      return { error: null }
    },
  }

  return {
    ops,
    firstDeleteStarted,
    supabase: {
      from() {
        return builder
      },
    },
  }
}

describe('setConversationDocuments', () => {
  test('deduplicates document ids before persisting', async () => {
    const { ops, supabase } = createSupabaseStub()
    const result = await setConversationDocuments(
      'conv-1',
      ['doc-1', 'doc-1', ' doc-2 ', '', null],
      { supabase },
    )

    expect(result.success).toBe(true)
    const upsertOp = ops.find(op => op.kind === 'upsert')
    expect(upsertOp.rows).toEqual([
      { conversation_id: 'conv-1', document_id: 'doc-1' },
      { conversation_id: 'conv-1', document_id: 'doc-2' },
    ])
    expect(upsertOp.options).toEqual({ onConflict: 'conversation_id,document_id' })
  })

  test('serializes concurrent writes for the same conversation', async () => {
    let release
    const gate = new Promise(resolve => {
      release = resolve
    })
    const { ops, supabase, firstDeleteStarted } = createSupabaseStub({ releaseFirstDelete: gate })

    const first = setConversationDocuments('conv-2', ['doc-a'], { supabase })
    const second = setConversationDocuments('conv-2', ['doc-b'], { supabase })

    await firstDeleteStarted
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ kind: 'delete', value: 'conv-2' })

    release()
    await Promise.all([first, second])

    expect(ops.map(op => op.kind)).toEqual(['delete', 'upsert', 'delete', 'upsert'])
    expect(ops[1].rows).toEqual([{ conversation_id: 'conv-2', document_id: 'doc-a' }])
    expect(ops[3].rows).toEqual([{ conversation_id: 'conv-2', document_id: 'doc-b' }])
  })
})
