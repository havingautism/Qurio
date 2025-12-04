import React from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import { getConversation } from "./lib/conversationsService";
import { listSpaces } from "./lib/spacesService";
import { initSupabase } from "./lib/supabase";

// Lazy load components for better performance
const HomeView = React.lazy(() => import("./views/HomeView"));
const ConversationView = React.lazy(() => import("./views/ConversationView"));
const SpacesView = React.lazy(() => import("./views/SpacesView"));
const SpaceView = React.lazy(() => import("./views/SpaceView"));
const LibraryView = React.lazy(() => import("./views/LibraryView"));
const BookmarksView = React.lazy(() => import("./views/BookmarksView"));

// Route loaders for data fetching
const conversationLoader = async ({ params }) => {
  try {
    initSupabase();
    const { data } = await getConversation(params.conversationId);
    if (!data) {
      throw new Response("Conversation not found", { status: 404 });
    }
    return { conversation: data };
  } catch (error) {
    console.error("Failed to load conversation:", error);
    throw new Response("Failed to load conversation", { status: 500 });
  }
};

const spacesLoader = async () => {
  try {
    initSupabase();
    const { data, error } = await listSpaces();
    if (error) {
      throw new Response("Failed to load spaces", { status: 500 });
    }
    return { spaces: data || [] };
  } catch (error) {
    console.error("Failed to load spaces:", error);
    throw new Response("Failed to load spaces", { status: 500 });
  }
};

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      {
        index: true,
        element: (
          <React.Suspense fallback={<div>Loading...</div>}>
            <HomeView />
          </React.Suspense>
        ),
      },
      {
        path: "new_chat",
        element: (
          <React.Suspense fallback={<div>Loading...</div>}>
            <HomeView />
          </React.Suspense>
        ),
      },
      {
        path: "conversation/:conversationId",
        element: (
          <React.Suspense fallback={<div>Loading...</div>}>
            <ConversationView />
          </React.Suspense>
        ),
        loader: conversationLoader,
      },
      {
        path: "spaces",
        element: (
          <React.Suspense fallback={<div>Loading...</div>}>
            <SpacesView />
          </React.Suspense>
        ),
        loader: spacesLoader,
      },
      {
        path: "space/:spaceId",
        element: (
          <React.Suspense fallback={<div>Loading...</div>}>
            <SpaceView />
          </React.Suspense>
        ),
        loader: spacesLoader,
      },
      {
        path: "library",
        element: (
          <React.Suspense fallback={<div>Loading...</div>}>
            <LibraryView />
          </React.Suspense>
        ),
      },
      {
        path: "bookmarks",
        element: (
          <React.Suspense fallback={<div>Loading...</div>}>
            <BookmarksView />
          </React.Suspense>
        ),
      },
    ],
    errorElement: <div>Something went wrong!</div>,
  },
]);

export default router;