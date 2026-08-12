import { ClerkProvider, useAuth } from "@clerk/react"
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode, useEffect } from "react"
import ReactDOM from "react-dom/client"
import { ApiError, OpenAPI } from "./client"
import { ThemeProvider } from "./components/theme-provider"
import { Toaster } from "./components/ui/sonner"
import "./index.css"
import { routeTree } from "./routeTree.gen"

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || ""



OpenAPI.BASE = import.meta.env.VITE_API_URL ?? ""
// Clerk owns the session; ClerkTokenBridge (below) installs the real getToken
// once the provider mounts. Until then there is no token to send.
OpenAPI.TOKEN = async () => ""

const handleApiError = (error: Error) => {
  // 403/404 are legitimate authorization/not-found answers under RBAC -- only a
  // 401 means the session itself is invalid, and Clerk handles that redirect.
  if (error instanceof ApiError && error.status === 401) {
    if (window.location.pathname !== "/login") {
      window.location.href = "/login"
    }
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes cache
      gcTime: 1000 * 60 * 15,
      refetchOnWindowFocus: false,
    },
  },
  queryCache: new QueryCache({
    onError: handleApiError,
  }),
  mutationCache: new MutationCache({
    onError: handleApiError,
  }),
})

/**
 * Feeds Clerk's session token to the generated API client.
 *
 * The client is a module-level singleton created outside React, so the token
 * getter has to be installed from inside the provider where useAuth() works.
 * getToken() returns a cached token and refreshes it as needed.
 */
function ClerkTokenBridge({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { getToken, isLoaded } = useAuth()

  useEffect(() => {
    OpenAPI.TOKEN = async () => (await getToken()) ?? ""
  }, [getToken])

  // Block rendering until Clerk resolves, otherwise the first queries fire
  // unauthenticated and 401.
  if (!isLoaded) return null
  return <>{children}</>
}

const router = createRouter({ routeTree })
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      routerPush={(to) => router.navigate({ to })}
      routerReplace={(to) => router.navigate({ to, replace: true })}
      domain={
        typeof window !== "undefined" && window.location.hostname.endsWith("brnch.in")
          ? "finance-agent.brnch.in"
          : undefined
      }
    >

      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <QueryClientProvider client={queryClient}>
          <ClerkTokenBridge>
            <RouterProvider router={router} />
          </ClerkTokenBridge>
          <Toaster richColors closeButton />
        </QueryClientProvider>
      </ThemeProvider>
    </ClerkProvider>
  </StrictMode>,
)
