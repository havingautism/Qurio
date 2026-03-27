import React from 'react'
import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'
import { AlertTriangle, MoveLeft } from 'lucide-react'
import App from './App'
import { getNodeEnv, getPublicEnv } from './lib/publicEnv'
import DotLoader from './components/DotLoader'
import { getConversation } from './lib/conversationsService'

const HomeView = React.lazy(() => import('./views/HomeView'))
const ConversationView = React.lazy(() => import('./views/ConversationView'))
const ExpertConversationView = React.lazy(() => import('./views/ExpertConversationView'))
const SpacesView = React.lazy(() => import('./views/SpacesView'))
const AgentsView = React.lazy(() => import('./views/AgentsView'))
const SpaceView = React.lazy(() => import('./views/SpaceView'))
const LibraryView = React.lazy(() => import('./views/LibraryView'))
const DeepResearchView = React.lazy(() => import('./views/DeepResearchView'))
const ExpertView = React.lazy(() => import('./views/ExpertView'))
const BookmarksView = React.lazy(() => import('./views/BookmarksView'))
const FilesView = React.lazy(() => import('./views/FilesView'))
const FileDetailView = React.lazy(() => import('./views/FileDetailView'))
const ScrapbookView = React.lazy(() => import('./views/ScrapbookView'))
const ScrapbookDetailView = React.lazy(() => import('./views/ScrapbookDetailView'))
const ShareImageView = React.lazy(() => import('./views/ShareImageView'))
const DeepResearchConversationView = React.lazy(
  () => import('./views/DeepResearchConversationView'),
)

const SuspensePage = ({ children, fallback = null }) => (
  <React.Suspense
    fallback={
      fallback || (
        <div className="bg-background text-foreground flex min-h-screen items-center justify-center">
          <div className="text-(--color-text-secondary) drop-shadow-[0_4px_18px_rgba(0,0,0,0.18)]">
            <DotLoader size="8px" gap="5px" />
          </div>
        </div>
      )
    }
  >
    {children}
  </React.Suspense>
)

const ConversationSuspenseFallback = () => (
  <div className="bg-background text-foreground flex min-h-screen items-center justify-center">
    <div className="text-(--color-text-secondary) drop-shadow-[0_4px_18px_rgba(0,0,0,0.18)]">
      <DotLoader size="8px" gap="5px" />
    </div>
  </div>
)

const PlainPageSuspenseFallback = () => <div className="bg-background min-h-screen" />

const NotFound = () => {
  const basepath = (
    getNodeEnv() === 'development' ? '/' : getPublicEnv('PUBLIC_BASE_PATH') || '/Qurio'
  ).replace(/\/$/, '')
  return (
    <div className="bg-background text-foreground flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-gray-200/80 bg-white/70 px-6 py-8 text-center shadow-lg backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-900 shadow dark:bg-zinc-800 dark:text-white">
          <AlertTriangle size={28} />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Oops! Page not found</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            The page you’re looking for doesn’t exist or was moved. Please check the URL or return
            to home.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            href={`${basepath}/new_chat`}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-black px-4 py-2 font-medium text-white transition hover:opacity-90 dark:bg-white dark:text-black"
          >
            <MoveLeft size={16} />
            Back to Home
          </a>
          <a
            href={`${basepath}/`}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 transition hover:bg-gray-100 dark:border-zinc-700 dark:text-gray-200 dark:hover:bg-zinc-800"
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
  beforeLoad: async ({ params }) => {
    const { conversationId } = params
    try {
      const { data: conv } = await getConversation(conversationId)
      if (conv?.scrapbook_id) {
        throw redirect({
          to: `/scrapbook/${conv.scrapbook_id}`,
        })
      }
    } catch (err) {
      // If it's a redirect, re-throw it
      if (err?.isRedirect || err?.name === 'Redirect') throw err
      console.error('[Router] Failed to check for scrapbook redirect:', err)
    }
  },
  component: () => (
    <SuspensePage fallback={<ConversationSuspenseFallback />}>
      <ConversationView />
    </SuspensePage>
  ),
})

export const expertConversationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'expert/$conversationId',
  component: () => (
    <SuspensePage fallback={<ConversationSuspenseFallback />}>
      <ExpertConversationView />
    </SuspensePage>
  ),
})

export const deepResearchConversationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'deepresearch/$conversationId',
  component: () => (
    <SuspensePage fallback={<ConversationSuspenseFallback />}>
      <DeepResearchConversationView />
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

export const agentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'agents',
  component: () => (
    <SuspensePage>
      <AgentsView />
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

export const deepResearchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'deepresearch',
  component: () => (
    <SuspensePage>
      <DeepResearchView />
    </SuspensePage>
  ),
})

export const expertRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'expert',
  component: () => (
    <SuspensePage>
      <ExpertView />
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

export const filesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'files',
  component: () => (
    <SuspensePage>
      <FilesView />
    </SuspensePage>
  ),
})

export const fileDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'files/$kind/$fileId',
  component: () => (
    <SuspensePage>
      <FileDetailView />
    </SuspensePage>
  ),
})

export const scrapbookRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'scrapbook',
  component: () => (
    <SuspensePage fallback={<PlainPageSuspenseFallback />}>
      <ScrapbookView />
    </SuspensePage>
  ),
})

export const scrapbookDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'scrapbook/$entryId',
  component: () => (
    <SuspensePage fallback={<PlainPageSuspenseFallback />}>
      <ScrapbookDetailView />
    </SuspensePage>
  ),
})

export const shareImageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'share',
  component: () => (
    <SuspensePage>
      <ShareImageView />
    </SuspensePage>
  ),
})

export const routeTree = rootRoute.addChildren([
  homeRoute,
  newChatRoute,
  conversationRoute,
  expertConversationRoute,
  deepResearchConversationRoute,
  spacesRoute,
  agentsRoute,
  spaceRoute,
  libraryRoute,
  deepResearchRoute,
  expertRoute,
  bookmarksRoute,
  filesRoute,
  fileDetailRoute,
  scrapbookRoute,
  scrapbookDetailRoute,
  shareImageRoute,
])

const getBasePath = () =>
  (getNodeEnv() === 'development' ? '/' : getPublicEnv('PUBLIC_BASE_PATH') || '/Qurio').replace(
    /\/$/,
    '',
  )

export const createAppRouter = () =>
  createRouter({
    routeTree,
    basepath: getBasePath(),
  })
