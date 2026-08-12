import { ClerkProvider, useClerk } from "@clerk/react";
import {
    MutationCache,
    QueryCache,
    QueryClient,
    QueryClientProvider,
} from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { ApiError, OpenAPI } from "./client";
import { ThemeProvider } from "./components/theme-provider";
import { Toaster } from "./components/ui/sonner";
import "./index.css";
import { routeTree } from "./routeTree.gen";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "";

OpenAPI.BASE = import.meta.env.VITE_API_URL ?? "";

// Eager, self-hydrating OpenAPI token getter that accesses window.Clerk immediately
OpenAPI.TOKEN = async () => {
    try {
        const globalClerk = (window as any).Clerk;
        if (globalClerk?.session) {
            const token = await globalClerk.session.getToken();
            if (token) return token;
        }
    } catch {
        // Fallback
    }
    return "";
};

const handleApiError = (error: Error) => {
    // 403/404 are legitimate authorization/not-found answers under RBAC.
    // Only redirect on 401 if user does NOT have a session cookie (i.e., truly logged out).
    // This prevents premature redirects to /login on hard refresh while Clerk token is hydrating.
    if (error instanceof ApiError && error.status === 401) {
        const hasSessionCookie = /(^|;\s*)(__session|__client_uat)=/.test(document.cookie);
        if (!hasSessionCookie && window.location.pathname !== "/login") {
            window.location.href = "/login";
        }
    }
};

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
});

/**
 * Feeds Clerk's session token to the generated API client eagerly.
 */
function ClerkTokenBridge({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    const { session } = useClerk();

    useEffect(() => {
        OpenAPI.TOKEN = async () => {
            try {
                if (session) {
                    const t = await session.getToken();
                    if (t) return t;
                }
                const globalClerk = (window as any).Clerk;
                if (globalClerk?.session) {
                    const t = await globalClerk.session.getToken();
                    if (t) return t;
                }
            } catch {
                return "";
            }
            return "";
        };
    }, [session]);

    return <>{children}</>;
}

const router = createRouter({ routeTree });
declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ClerkProvider
            publishableKey={PUBLISHABLE_KEY}
            routerPush={(to: string) => router.navigate({ to })}
            routerReplace={(to: string) =>
                router.navigate({ to, replace: true })
            }
            signInFallbackRedirectUrl="/chat"
            signUpFallbackRedirectUrl="/chat"
            afterSignOutUrl="/login"
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
);

