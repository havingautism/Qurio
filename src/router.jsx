import React from 'react'
import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'
import { AlertTriangle, MoveLeft } from 'lucide-react'
import App from './App'
import { getNodeEnv, getPublicEnv } from './lib/publicEnv'

const HomeView = React.lazy(() => import('./views/HomeView'))
const ConversationView = React.lazy(() => import('./views/ConversationView'))
const SpacesView = React.lazy(() => import('./views/SpacesView'))
const SpaceView = React.lazy(() => import('./views/SpaceView'))
const LibraryView = React.lazy(() => import('./views/LibraryView'))
const BookmarksView = React.lazy(() => import('./views/BookmarksView'))

const SuspensePage = ({ children }) => (
  <React.Suspense fallback={<div className="min-h-screen bg-background text-foreground" />}>
    {children}
  </React.Suspense>
)

const NotFound = () => {
  const basepath = (
    getNodeEnv() === 'development'
      ? '/'
      : getPublicEnv('PUBLIC_BASE_PATH') || '/Qurio'
  ).replace(/\/$/, '')
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-6 py-12">
      <div className="w-full max-w-md text-center space-y-6 bg-white/70 dark:bg-zinc-900/80 backdrop-blur-md rounded-2xl shadow-lg border border-gray-200/80 dark:border-zinc-800 px-6 py-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white shadow">
          <AlertTriangle size={28} />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Oops! Page not found</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            The page you’re looking for doesn’t exist or was moved. Please check the URL or return
            to home.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-center gap-3">
          <a
            href={`${basepath}/new_chat`}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-black text-white dark:bg-white dark:text-black font-medium hover:opacity-90 transition"
          >
            <MoveLeft size={16} />
            Back to Home
          </a>
          <a
            href={`${basepath}/`}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-100 dark:hover:bg-zinc-800 transition"
          >
            Reload
          </a>
        </div>
      </div>
    </div>
  )
}

export const rootRoute = createRootRoute({
  component: App,
  notFoundComponent: NotFound,
})

export const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => redirect({ to: '/new_chat' }),
})

export const newChatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'new_chat',
  component: () => (
    <SuspensePage>
      <HomeView />
    </SuspensePage>
  ),
})

export const conversationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'conversation/$conversationId',
  component: () => (
    <SuspensePage>
      <ConversationView />
    </SuspensePage>
  ),
})

export const spacesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'spaces',
  component: () => (
    <SuspensePage>
      <SpacesView />
    </SuspensePage>
  ),
})

export const spaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'space/$spaceId',
  component: () => (
    <SuspensePage>
      <SpaceView />
    </SuspensePage>
  ),
})

export const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'library',
  component: () => (
    <SuspensePage>
      <LibraryView />
    </SuspensePage>
  ),
})

export const bookmarksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'bookmarks',
  component: () => (
    <SuspensePage>
      <BookmarksView />
    </SuspensePage>
  ),
})

export const routeTree = rootRoute.addChildren([
  homeRoute,
  newChatRoute,
  conversationRoute,
  spacesRoute,
  spaceRoute,
  libraryRoute,
  bookmarksRoute,
])

const getBasePath = () =>
  (
    getNodeEnv() === 'development'
      ? '/'
      : getPublicEnv('PUBLIC_BASE_PATH') || '/Qurio'
  ).replace(/\/$/, '')

export const createAppRouter = () =>
  createRouter({
    routeTree,
    basepath: getBasePath(),
  })
