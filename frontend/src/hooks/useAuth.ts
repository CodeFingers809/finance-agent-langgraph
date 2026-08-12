import { useAuth as useClerkAuth, useClerk, useUser } from "@clerk/react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"

import { type UserPublic, UsersService } from "@/client"

/**
 * Best-effort "is there a session?" check for router `beforeLoad` guards, which
 * run outside React and so cannot use Clerk hooks.
 *
 * Clerk's client-side cookie name varies by instance (`__session` on the same
 * origin, `__client_uat` for the signed-in-at hint), so this checks for any of
 * them. It is a HINT ONLY -- never make an authenticated API call based on it,
 * because the token bridge isn't installed until React mounts. Route
 * components gate on `isLoaded`/`isSignedIn` from useAuth(); the backend
 * verifies every request regardless.
 */
const isLoggedIn = () => {
  return /(^|;\s*)(__session|__client_uat)=/.test(document.cookie)
}

const useAuth = () => {
  const navigate = useNavigate()
  const { isSignedIn, isLoaded, orgId, orgRole } = useClerkAuth()
  const { user: clerkUser } = useUser()
  const { signOut } = useClerk()

  // The locally-mirrored profile (id, is_superuser, ...) returned by the API.
  // Distinct from clerkUser, which is Clerk's own profile object.
  const { data: user } = useQuery<UserPublic | null, Error>({
    queryKey: ["currentUser"],
    queryFn: UsersService.readUserMe,
    enabled: isLoaded && !!isSignedIn,
    retry: 2,
    retryDelay: 1000,
  })


  const logout = async () => {
    await signOut()
    navigate({ to: "/login" })
  }

  return {
    user,
    clerkUser,
    logout,
    isLoaded,
    isSignedIn: !!isSignedIn,
    orgId,
    orgRole,
    isOrgAdmin: orgRole === "org:admin",
  }
}

export { isLoggedIn }
export default useAuth
