/**
 * NotificationCenter — Email notification bell + modal panel.
 *
 * Features:
 *  - Bell icon with unread badge count
 *  - Modal panel with backdrop overlay
 *  - Tabs to filter notifications by email account
 *  - Click to view full summary in detail modal
 *  - Click external link icon to open in webmail
 *  - Mark individual or all notifications as read
 *  - Auto-refresh every 5 minutes
 *  - ESC key to close
 */

import { Check, CheckCheck, ExternalLink, Inbox, Mail, RefreshCw, Trash2, X } from 'lucide-react'
import { EnvelopeSimple as EnvelopeSimpleIcon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { useCallback, useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { getBackendUrl } from '../lib/settings'

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const buildUrl = (path, params = {}) => {
  const url = new URL(`${getBackendUrl()}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return url.toString()
}

const fetchConfigs = async () => {
  const res = await fetch(buildUrl('/api/email/configs'))
  if (!res.ok) return []
  const data = await res.json()
  return data.configs || []
}

const fetchNotifications = async ({ configId, limit = 30 } = {}) => {
  const params = { limit }
  if (configId) params.configId = configId
  const res = await fetch(buildUrl('/api/email/notifications', params))
  if (!res.ok) throw new Error(`Failed to fetch notifications: ${res.status}`)
  return res.json()
}

const markRead = async id => {
  const res = await fetch(buildUrl(`/api/email/notifications/${id}/read`), { method: 'PATCH' })
  if (!res.ok) throw new Error(`Failed to mark read: ${res.status}`)
}

const markAllRead = async configId => {
  const params = configId ? { configId } : {}
  const res = await fetch(buildUrl('/api/email/notifications/read-all', params), {
    method: 'PATCH',
  })
  if (!res.ok) throw new Error(`Failed to mark all read: ${res.status}`)
}

const deleteNotification = async id => {
  const res = await fetch(buildUrl(`/api/email/notifications/${id}`), { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to delete notification: ${res.status}`)
}

const triggerPoll = async () => {
  const res = await fetch(buildUrl('/api/email/poll'), { method: 'POST' })
  if (!res.ok) throw new Error(`Failed to trigger poll: ${res.status}`)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const NotificationCenter = ({ buttonClassName = '' }) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [configs, setConfigs] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('all')
  const [selectedNotification, setSelectedNotification] = useState(null)

  // Helper function for relative time with i18n
  const formatRelativeTime = useCallback(
    dateStr => {
      if (!dateStr) return ''
      const diff = Date.now() - new Date(dateStr).getTime()
      const mins = Math.floor(diff / 60000)
      if (mins < 1) return t('notificationCenter.timeAgo.justNow')
      if (mins < 60) return t('notificationCenter.timeAgo.minutesAgo', { count: mins })
      const hrs = Math.floor(mins / 60)
      if (hrs < 24) return t('notificationCenter.timeAgo.hoursAgo', { count: hrs })
      return t('notificationCenter.timeAgo.daysAgo', { count: Math.floor(hrs / 24) })
    },
    [t],
  )

  // Build email URL for jumping to the email in webmail
  const buildEmailUrl = useCallback((provider, messageId) => {
    if (!messageId) return null
    switch (provider) {
      case 'gmail':
        return `https://mail.google.com/mail/u/0/#search/rfc822msgid%3A${encodeURIComponent(messageId)}`
      case 'outlook':
        return 'https://outlook.live.com/mail/0/inbox'
      case 'qq':
        return 'https://mail.qq.com/'
      case '163':
        return 'https://mail.163.com/'
      default:
        return null
    }
  }, [])

  const handleOpenEmail = useCallback(
    notif => {
      const url = buildEmailUrl(notif.provider, notif.message_id)
      if (url) window.open(url, '_blank')
    },
    [buildEmailUrl],
  )

  // Calculate unread counts
  const totalUnreadCount = useMemo(() => {
    return notifications.filter(n => !n.is_read).length
  }, [notifications])

  const unreadCountByConfig = useMemo(() => {
    const counts = {}
    notifications.forEach(n => {
      if (!n.is_read && n.config_id) {
        counts[n.config_id] = (counts[n.config_id] || 0) + 1
      }
    })
    return counts
  }, [notifications])

  // Config id to email mapping
  const configEmailMap = useMemo(() => {
    const map = {}
    configs.forEach(c => {
      map[c.id] = c.email
    })
    return map
  }, [configs])

  // Load configs and notifications
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [configsData, notifsData] = await Promise.all([
        fetchConfigs(),
        fetchNotifications({ limit: 50 }),
      ])
      setConfigs(configsData)
      setNotifications(notifsData.notifications || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Filter notifications by active tab
  const filteredNotifications = useMemo(() => {
    if (activeTab === 'all') return notifications
    return notifications.filter(n => n.config_id === activeTab)
  }, [notifications, activeTab])

  // Pull only when user opens the panel.
  useEffect(() => {
    if (!isOpen) return undefined
    let cancelled = false
    const pullOnOpen = async () => {
      try {
        await triggerPoll()
      } catch {
        // Keep UI usable even if IMAP poll fails.
      }
      if (!cancelled) {
        await load()
      }
    }
    pullOnOpen()
    return () => {
      cancelled = true
    }
  }, [isOpen, load])

  // ESC key to close
  useEffect(() => {
    if (!isOpen) return undefined
    const handler = e => {
      if (e.key === 'Escape') {
        setIsOpen(false)
        setSelectedNotification(null)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen])

  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const handleMarkRead = async id => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)))
    try {
      await markRead(id)
    } catch {
      setNotifications(prev => prev.map(n => (n.id === id ? { ...n, is_read: false } : n)))
    }
  }

  const handleMarkAllRead = async () => {
    const configId = activeTab === 'all' ? null : activeTab
    setNotifications(prev =>
      prev.map(n => (configId && n.config_id !== configId ? n : { ...n, is_read: true })),
    )
    try {
      await markAllRead(configId)
    } catch {
      load()
    }
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    const original = [...notifications]
    setNotifications(prev => prev.filter(n => n.id !== id))
    setSelectedNotification(null)
    try {
      await deleteNotification(id)
    } catch (err) {
      setError(t('notificationCenter.deleteFailed', { message: err.message }))
      setNotifications(original)
    }
  }

  const handleSelectNotification = notif => {
    setSelectedNotification(notif)
    if (!notif.is_read) handleMarkRead(notif.id)
  }

  // Detail modal for selected notification
  const detailModal = selectedNotification
    ? createPortal(
        <div
          className="fixed inset-0 z-10000 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setSelectedNotification(null)}
          />

          {/* Detail Panel */}
          <div className="glass-elite-panel relative z-10 w-full max-w-2xl overflow-hidden rounded-[28px] border-none shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-800/50">
              <div className="flex items-center gap-3">
                <div className="from-primary-400 to-primary-600 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br">
                  <Mail size={20} className="text-white" />
                </div>
                <span className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {t('notificationCenter.emailDetail')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenEmail(selectedNotification)}
                  className="text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/20 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                >
                  <ExternalLink size={16} />
                  {t('notificationCenter.openInMail')}
                </button>
                <button
                  onClick={() => setSelectedNotification(null)}
                  className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-gray-300"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="max-h-[65vh] space-y-5 overflow-y-auto p-6">
              {/* Subject */}
              <div>
                <h3 className="text-lg leading-snug font-semibold text-gray-900 dark:text-gray-100">
                  {selectedNotification.subject || t('notificationCenter.noSubject')}
                </h3>
              </div>

              {/* Meta info */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">{t('notificationCenter.from')}:</span>
                  <span>
                    {selectedNotification.sender || t('notificationCenter.unknownSender')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">{t('notificationCenter.time')}:</span>
                  <span>
                    {formatRelativeTime(
                      selectedNotification.received_at || selectedNotification.created_at,
                    )}
                  </span>
                </div>
                {selectedNotification.config_id && configs.length > 1 && (
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{t('notificationCenter.account')}:</span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-zinc-700">
                      {configEmailMap[selectedNotification.config_id]?.split('@')[0]}
                    </span>
                  </div>
                )}
              </div>

              {/* Summary */}
              {selectedNotification.summary && (
                <div className="border-t border-gray-100 pt-4 dark:border-zinc-800">
                  <h4 className="mb-3 text-sm font-semibold tracking-wide text-gray-700 uppercase dark:text-zinc-300">
                    {t('notificationCenter.summary')}
                  </h4>
                  <p className="text-base leading-relaxed whitespace-pre-wrap text-gray-600 dark:text-zinc-400">
                    {selectedNotification.summary}
                  </p>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/50 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-800/50">
              <button
                onClick={e => handleDelete(e, selectedNotification.id)}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                <Trash2 size={16} />
                {t('notificationCenter.delete')}
              </button>
              <button
                onClick={() => handleOpenEmail(selectedNotification)}
                className="bg-primary-500 hover:bg-primary-600 flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium text-white transition-colors"
              >
                <ExternalLink size={16} />
                {t('notificationCenter.openInMail')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null

  // Modal rendered via portal
  const modal = isOpen
    ? createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-center px-4 pt-[10vh] pb-4"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* Modal Panel */}
          <div
            className="glass-elite-panel relative z-10 flex w-full max-w-xl flex-col overflow-hidden rounded-[28px] border-none shadow-2xl"
            style={{ maxHeight: '80vh' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="from-primary-400 to-primary-600 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br shadow-sm">
                  <Inbox size={16} className="text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {t('notificationCenter.title')}
                  </h2>
                  {totalUnreadCount > 0 && (
                    <p className="text-xs text-gray-500 dark:text-zinc-400">
                      {totalUnreadCount} {t('notificationCenter.newCount', { count: '' }).trim()}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={load}
                  disabled={loading}
                  className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-gray-300"
                  title={t('notificationCenter.refresh')}
                >
                  <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                </button>
                {totalUnreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-gray-300"
                    title={t('notificationCenter.markAllRead')}
                  >
                    <CheckCheck size={16} />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-gray-300"
                  title={t('notificationCenter.close')}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Tabs */}
            {configs.length > 1 && (
              <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-100 bg-gray-50/50 px-3 py-2 dark:border-zinc-800/50 dark:bg-zinc-800/30">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${activeTab === 'all' ? 'bg-black/5 text-gray-900 shadow-sm dark:bg-white/10 dark:text-gray-100' : 'text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
                >
                  {t('notificationCenter.all')}{' '}
                  <span className="ml-0.5 opacity-60">{notifications.length}</span>
                </button>
                <div className="mx-1 h-4 w-px bg-gray-200 dark:bg-zinc-700" />
                {configs.map(config => {
                  const count = unreadCountByConfig[config.id] || 0
                  const isActive = activeTab === config.id
                  return (
                    <button
                      key={config.id}
                      onClick={() => setActiveTab(config.id)}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${isActive ? 'bg-black/5 text-gray-900 shadow-sm dark:bg-white/10 dark:text-gray-100' : 'text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
                    >
                      <span className="max-w-[100px] truncate">{config.email.split('@')[0]}</span>
                      {count > 0 && (
                        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                          {count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {loading && notifications.length === 0 && (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw size={20} className="animate-spin text-gray-400" />
                </div>
              )}
              {error && <div className="px-4 py-6 text-center text-sm text-red-500">{error}</div>}
              {!loading && !error && filteredNotifications.length === 0 && (
                <div className="flex flex-col items-center py-12 text-center">
                  <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800">
                    <Inbox size={24} className="text-gray-400 dark:text-zinc-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-600 dark:text-zinc-300">
                    {activeTab === 'all'
                      ? t('notificationCenter.empty.title')
                      : t('notificationCenter.emptyForAccount.title')}
                  </p>
                  <p className="mt-1 text-xs text-gray-400 dark:text-zinc-500">
                    {activeTab === 'all'
                      ? t('notificationCenter.empty.hint')
                      : t('notificationCenter.emptyForAccount.hint')}
                  </p>
                </div>
              )}

              {/* Notification Cards */}
              <div className="space-y-2 p-3">
                {filteredNotifications.map(notif => (
                  <div
                    key={notif.id}
                    onClick={() => handleSelectNotification(notif)}
                    className={`group relative cursor-pointer rounded-xl p-4 transition-all ${notif.is_read ? 'hover:bg-gray-50 dark:hover:bg-zinc-800/50' : 'bg-primary-50/50 hover:bg-primary-50 dark:bg-primary-950/20 dark:hover:bg-primary-950/30'}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Unread indicator */}
                      <div
                        className={`mt-2 h-2.5 w-2.5 flex-shrink-0 rounded-full ${notif.is_read ? 'bg-transparent' : 'bg-primary-500'}`}
                      />

                      <div className="min-w-0 flex-1">
                        {/* Header row */}
                        <div className="flex items-start justify-between gap-3">
                          <p
                            className={`text-sm leading-snug ${notif.is_read ? 'text-gray-700 dark:text-gray-300' : 'font-medium text-gray-900 dark:text-gray-100'}`}
                          >
                            {notif.subject || t('notificationCenter.noSubject')}
                          </p>
                          <span className="mt-0.5 flex-shrink-0 text-xs text-gray-400 dark:text-zinc-500">
                            {formatRelativeTime(notif.received_at || notif.created_at)}
                          </span>
                        </div>

                        {/* Sender */}
                        <div className="mt-1.5 flex items-center gap-2">
                          <p className="truncate text-xs text-gray-500 dark:text-zinc-400">
                            {notif.sender || t('notificationCenter.unknownSender')}
                          </p>
                          {notif.config_id && configs.length > 1 && (
                            <span
                              className="max-w-[100px] truncate rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500 dark:bg-zinc-700 dark:text-zinc-400"
                              title={configEmailMap[notif.config_id]}
                            >
                              {configEmailMap[notif.config_id]?.split('@')[0]}
                            </span>
                          )}
                        </div>

                        {/* Summary preview */}
                        {notif.summary && (
                          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-500 dark:text-zinc-400">
                            {notif.summary}
                          </p>
                        )}

                        {/* Actions */}
                        <div className="mt-3 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <span className="text-primary-500 dark:text-primary-400 text-xs font-medium">
                            {t('notificationCenter.viewDetail') || 'View'}
                          </span>
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              handleOpenEmail(notif)
                            }}
                            className="hover:text-primary-500 dark:hover:text-primary-400 flex items-center gap-1 text-xs text-gray-400 dark:text-zinc-500"
                            title={t('notificationCenter.openInMail')}
                          >
                            <ExternalLink size={12} />
                          </button>
                          {!notif.is_read && (
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                handleMarkRead(notif.id)
                              }}
                              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                            >
                              <Check size={12} /> {t('notificationCenter.markAsRead')}
                            </button>
                          )}
                          <button
                            onClick={e => handleDelete(e, notif.id)}
                            className="ml-auto text-xs text-gray-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400"
                            title={t('notificationCenter.delete')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
        className={clsx(
          'relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl transition-all duration-300 hover:scale-105 active:scale-95',
          buttonClassName ||
            'border border-white/75 bg-white/55 text-slate-600 hover:border-white hover:bg-white/75 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white/75 dark:hover:border-white/15 dark:hover:bg-white/10 dark:hover:text-white',
        )}
        title={t('notificationCenter.title')}
      >
        {/* <Bell size={20} /> */}
        <EnvelopeSimpleIcon size={20} weight="duotone" />
        {totalUnreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
          </span>
        )}
      </button>
      {modal}
      {detailModal}
    </>
  )
}

export default NotificationCenter
