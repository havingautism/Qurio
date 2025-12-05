import React from 'react'
import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import App from './App'
import FancyLoader from './components/FancyLoader'

const HomeView = React.lazy(() => import('./views/HomeView'))
const ConversationView = React.lazy(() => import('./views/ConversationView'))
const SpacesView = React.lazy(() => import('./views/SpacesView'))
const SpaceView = React.lazy(() => import('./views/SpaceView'))
const LibraryView = React.lazy(() => import('./views/LibraryView'))
const BookmarksView = React.lazy(() => import('./views/BookmarksView'))

const SuspensePage = ({ children }) => (
  <React.Suspense
    fallback={
      <div className="flex min-h-screen bg-background text-foreground font-sans items-center justify-center">
        <FancyLoader />
      </div>
    }
  >
    {children}
  </React.Suspense>
)

export const rootRoute = createRootRoute({
  component: App,
  notFoundComponent: () => <div>Something went wrong!</div>,
})

export const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => (
    <SuspensePage>
      <HomeView />
    </SuspensePage>
  ),
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

const routeTree = rootRoute.addChildren([
  homeRoute,
  newChatRoute,
  conversationRoute,
  spacesRoute,
  spaceRoute,
  libraryRoute,
  bookmarksRoute,
])

const router = createRouter({
  routeTree,
})

export default router
