/**
 * NotificationCenter — Email notification bell + full-screen modal.
 *
 * Features:
 *  - Bell icon with unread badge count
 *  - Full-screen modal (like SettingsModal) with backdrop overlay
 *  - Mark individual or all notifications as read
 *  - Auto-refresh every 5 minutes
 *  - ESC key to close
 */

import { Bell, CheckCheck, Mail, RefreshCw, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { loadSettings } from '../lib/settings'

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const getBackendUrl = () => {
  const settings = loadSettings()
  return settings.backendUrl || 'http://127.0.0.1:3002'
}

const getDbProvider = () => {
  const settings = loadSettings()
  return settings.databaseProvider || 'supabase'
}

const buildUrl = (path, params = {}) => {
  const url = new URL(`${getBackendUrl()}${path}`)
  const dbProvider = getDbProvider()
  if (dbProvider) url.searchParams.set('dbProvider', dbProvider)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return url.toString()
}

const fetchNotifications = async ({ limit = 30 } = {}) => {
  const res = await fetch(buildUrl('/api/email/notifications', { limit }))
  if (!res.ok) throw new Error(`Failed to fetch notifications: ${res.status}`)
  return res.json()
}

const markRead = async id => {
  const res = await fetch(buildUrl(`/api/email/notifications/${id}/read`), { method: 'PATCH' })
  if (!res.ok) throw new Error(`Failed to mark read: ${res.status}`)
}

const markAllRead = async () => {
  const res = await fetch(buildUrl('/api/email/notifications/read-all'), { method: 'PATCH' })
  if (!res.ok) throw new Error(`Failed to mark all read: ${res.status}`)
}

const deleteNotification = async id => {
  const res = await fetch(buildUrl(`/api/email/notifications/${id}`), { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to delete notification: ${res.status}`)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatRelativeTime = dateStr => {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const NotificationCenter = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const unreadCount = notifications.filter(n => !n.is_read).length

  // Load notifications from backend
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchNotifications({ limit: 30 })
      setNotifications(data.notifications || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-refresh every 5 minutes
  useEffect(() => {
    load()
    const interval = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [load])

  // ESC key to close
  useEffect(() => {
    if (!isOpen) return undefined
    const handler = e => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen])

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const handleMarkRead = async id => {
    // Optimistic update
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)))
    try {
      await markRead(id)
    } catch {
      // Revert on failure
      setNotifications(prev => prev.map(n => (n.id === id ? { ...n, is_read: false } : n)))
    }
  }

  const handleMarkAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    try {
      await markAllRead()
    } catch {
      load()
    }
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    // Optimistic update
    const original = [...notifications]
    setNotifications(prev => prev.filter(n => n.id !== id))
    try {
      await deleteNotification(id)
    } catch (e) {
      setError(`删除失败: ${e.message}`)
      setNotifications(original)
    }
  }

  // Modal rendered via portal so it's never clipped by sidebar
  const modal = isOpen
    ? createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Email Notifications"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* Modal panel */}
          <div
            className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
            style={{ maxHeight: '80vh' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-zinc-700">
              <div className="flex items-center gap-2">
                <Mail size={18} className="text-primary-500" />
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  Email Notifications
                </span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600 dark:bg-red-900/40 dark:text-red-400">
                    {unreadCount} new
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                {/* Refresh */}
                <button
                  onClick={load}
                  disabled={loading}
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 dark:hover:bg-zinc-700 dark:hover:text-gray-200"
                  title="Refresh"
                >
                  <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                </button>

                {/* Mark all read */}
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-700 dark:hover:text-gray-200"
                    title="Mark all as read"
                  >
                    <CheckCheck size={15} />
                  </button>
                )}

                {/* Close */}
                <button
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-700 dark:hover:text-gray-200"
                  title="Close"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {/* Loading */}
              {loading && notifications.length === 0 && (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw size={22} className="animate-spin text-gray-400" />
                </div>
              )}

              {/* Error */}
              {error && <div className="px-5 py-4 text-center text-xs text-red-500">{error}</div>}

              {/* Empty state */}
              {!loading && !error && notifications.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800">
                    <Mail size={26} className="text-gray-400 dark:text-zinc-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">
                    No email notifications yet
                  </p>
                  <p className="text-xs text-gray-400 dark:text-zinc-500">
                    Connect Email in Settings to get started
                  </p>
                </div>
              )}

              {/* Notification list */}
              {notifications.map(notif => (
                <div
                  key={notif.id}
                  className={`group relative border-b border-gray-50 px-5 py-4 transition-colors last:border-0 dark:border-zinc-800 ${
                    notif.is_read
                      ? 'bg-white dark:bg-zinc-900'
                      : 'bg-blue-50/60 dark:bg-blue-950/20'
                  }`}
                >
                  {/* Unread dot */}
                  {!notif.is_read && (
                    <span className="absolute top-5 left-3 h-2 w-2 rounded-full bg-blue-500" />
                  )}

                  <div className="pl-3">
                    {/* Subject + time */}
                    <div className="flex items-start justify-between gap-3">
                      <p className="line-clamp-1 text-sm font-semibold text-gray-800 dark:text-gray-100">
                        {notif.subject || '(No subject)'}
                      </p>
                      <div className="flex shrink-0 items-start gap-2">
                        <span className="text-xs text-gray-400 dark:text-zinc-500">
                          {formatRelativeTime(notif.received_at || notif.created_at)}
                        </span>
                        <button
                          onClick={e => handleDelete(e, notif.id)}
                          className="rounded-md p-1 text-gray-400 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 dark:text-zinc-500 dark:hover:bg-red-900/20"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Sender */}
                    <p className="mt-0.5 line-clamp-1 text-xs text-gray-500 dark:text-zinc-400">
                      {notif.sender || 'Unknown sender'}
                    </p>

                    {/* AI Summary */}
                    {notif.summary && (
                      <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-zinc-300">
                        {notif.summary}
                      </p>
                    )}

                    {/* Mark read button */}
                    {!notif.is_read && (
                      <button
                        onClick={() => handleMarkRead(notif.id)}
                        className="mt-2 text-xs text-blue-500 opacity-0 transition-opacity group-hover:opacity-100 hover:underline dark:text-blue-400"
                      >
                        Mark as read
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null

  return (
    <>
      {/* Bell Button */}
      <button
        id="notification-center-bell"
        onClick={() => setIsOpen(prev => !prev)}
        className="bg-user-bubble relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-gray-600 transition-all duration-300 hover:scale-105 hover:bg-gray-100 active:scale-95 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700"
        title="Email Notifications"
      >
        <Bell size={20} />
        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Modal portal */}
      {modal}
    </>
  )
}

export default NotificationCenter
