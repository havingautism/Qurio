export const cosineSimilarity = (left, right) => {
  if (!Array.isArray(left) || !Array.isArray(right)) return null
  if (left.length === 0 || right.length === 0) return null
  if (left.length !== right.length) return null
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < left.length; i += 1) {
    const a = Number(left[i])
    const b = Number(right[i])
    if (Number.isNaN(a) || Number.isNaN(b)) return null
    dot += a * b
    normA += a * a
    normB += b * b
  }
  if (normA === 0 || normB === 0) return null
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
