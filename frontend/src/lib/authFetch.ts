import { OpenAPI } from "@/client"

/**
 * Current Clerk session token, via the getter ClerkTokenBridge installs on
 * OpenAPI.TOKEN.
 *
 * Several screens call the API with raw `fetch` instead of the generated
 * client (SSE streaming, which the client doesn't support, plus some older
 * code). They used to read a `localStorage` token that Clerk never sets, so
 * every one of those requests went out unauthenticated and 401'd.
 */
export async function getAuthToken(): Promise<string> {
  const token = OpenAPI.TOKEN
  if (typeof token === "function") {
    return (await (token as () => Promise<string>)()) ?? ""
  }
  return (token as string) ?? ""
}

/** Authorization header for a raw fetch. Empty when there's no session. */
export async function authHeader(): Promise<Record<string, string>> {
  const token = await getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** `fetch` against the API base with the Clerk bearer token attached. */
export async function authFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const res = await fetch(`${OpenAPI.BASE}/api/v1${path}`, {
    ...init,
    headers: { ...(await authHeader()), ...init.headers },
  })
  if (res.status === 401 && window.location.pathname !== "/login") {
    window.location.href = "/login"
  }
  return res
}

