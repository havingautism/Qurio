const BASELINE_MAX_CHUNKS = 400
const HARD_MAX_CHUNKS = 1200

export const resolveDocumentMaxChunks = ({
  textLength = 0,
  chunkSize = 1200,
  chunkOverlap = 200,
} = {}) => {
  const safeChunkSize = Math.max(1, Number(chunkSize) || 1200)
  const safeOverlap = Math.max(0, Number(chunkOverlap) || 0)
  const effectiveStride = Math.max(1, safeChunkSize - safeOverlap)
  const estimatedChunks = Math.ceil(Math.max(0, Number(textLength) || 0) / effectiveStride)
  const target = Math.max(BASELINE_MAX_CHUNKS, estimatedChunks + 20)
  return Math.min(HARD_MAX_CHUNKS, target)
}

export const DOCUMENT_BASELINE_MAX_CHUNKS = BASELINE_MAX_CHUNKS
export const DOCUMENT_HARD_MAX_CHUNKS = HARD_MAX_CHUNKS
