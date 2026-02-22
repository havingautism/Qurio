import { useState, useEffect, useRef, useCallback } from 'react'
import { conversationEventHasScope } from '../lib/conversationsService'

/**
 * Custom hook for infinite scroll with cursor-based pagination
 *
 * @param {Function} fetchFunction - Function that fetches data, receives (cursor, ...params)
 *                                   Should return { data, nextCursor, hasMore }
 * @param {Object} options - Configuration options
 * @param {number} options.limit - Number of items to fetch per page (default: 10)
 * @param {Array} options.dependencies - Dependencies that trigger data refresh (default: [])
 * @param {boolean} options.enabled - Whether to enable fetching (default: true)
 * @param {number} options.rootMargin - Intersection observer root margin in px (default: 100)
 * @param {string|string[]} options.eventScope - Scope filter for conversations-changed events
 *
 * @returns {Object} - { data, loading, loadingMore, hasMore, loadMoreRef, refresh, error }
 */
export function useInfiniteScroll(fetchFunction, options = {}) {
  const {
    limit = 10,
    dependencies = [],
    enabled = true,
    rootMargin = '100px',
    eventScope = null,
  } = options

  const [data, setData] = useState([])
  const [cursor, setCursor] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const loadMoreRef = useRef(null)

  // Fetch initial data
  const fetchInitialData = useCallback(async () => {
    if (!enabled) return

    setLoading(true)
    setData([])
    setCursor(null)
    setHasMore(true)
    setError(null)

    try {
      const result = await fetchFunction(null, limit)
      setData(result.data || [])
      setCursor(result.nextCursor)
      setHasMore(result.hasMore)
    } catch (err) {
      console.error('Failed to fetch initial data:', err)
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [fetchFunction, limit, enabled])

  // Load more data
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading || !enabled) return

    setLoadingMore(true)
    setError(null)

    try {
      const result = await fetchFunction(cursor, limit)
      setData(prev => [...prev, ...(result.data || [])])
      setCursor(result.nextCursor)
      setHasMore(result.hasMore)
    } catch (err) {
      console.error('Failed to load more data:', err)
      setError(err)
    } finally {
      setLoadingMore(false)
    }
  }, [cursor, hasMore, loadingMore, loading, fetchFunction, limit, enabled])

  // Refresh data (reset and reload)
  const refresh = useCallback(() => {
    fetchInitialData()
  }, [fetchInitialData])

  // Fetch initial data when dependencies change
  useEffect(() => {
    fetchInitialData()
  }, [enabled, ...dependencies])

  // Listen for conversation changes (e.g., favorite/delete)
  useEffect(() => {
    const handleConversationsChanged = event => {
      if (!conversationEventHasScope(event, eventScope)) return
      refresh()
    }

    window.addEventListener('conversations-changed', handleConversationsChanged)
    return () => {
      window.removeEventListener('conversations-changed', handleConversationsChanged)
    }
  }, [refresh, eventScope])

  // Setup Intersection Observer for infinite scroll
  useEffect(() => {
    if (!enabled) return

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          loadMore()
        }
      },
      { threshold: 0.1, rootMargin: `${rootMargin}` },
    )

    const currentRef = loadMoreRef.current
    if (currentRef) {
      observer.observe(currentRef)
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef)
      }
    }
  }, [loadMore, enabled, rootMargin])

  return {
    data,
    loading,
    loadingMore,
    hasMore,
    loadMoreRef,
    refresh,
    error,
  }
}
