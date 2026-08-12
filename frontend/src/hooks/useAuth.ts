import { useAuthContext } from "@/context/AuthContext"

/**
 * Best-effort "is there a session?" check for router `beforeLoad` guards, which
 * run outside React and so cannot use Clerk hooks.
 */
const isLoggedIn = () => {
  return /(^|;\s*)(__session|__client_uat)=/.test(document.cookie)
}

const useAuth = () => {
  return useAuthContext()
}

export { isLoggedIn }
export default useAuth
