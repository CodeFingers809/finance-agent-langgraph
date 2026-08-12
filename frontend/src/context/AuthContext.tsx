import React, { createContext, useContext, useMemo } from "react"
import { useAuth as useClerkAuth, useClerk, useUser } from "@clerk/react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"

import { type UserPublic, UsersService } from "@/client"

interface AuthContextType {
  user: UserPublic | null | undefined
  clerkUser: ReturnType<typeof useUser>["user"]
  logout: () => Promise<void>
  isLoaded: boolean
  isSignedIn: boolean
  orgId: string | null | undefined
  orgRole: string | null | undefined
  isOrgAdmin: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  let navigate: any = null
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    navigate = useNavigate()
  } catch {
    // Fallback if rendered outside router
  }

  const { isSignedIn, isLoaded, orgId, orgRole } = useClerkAuth()
  const { user: clerkUser } = useUser()
  const { signOut } = useClerk()

  const { data: user } = useQuery<UserPublic | null, Error>({
    queryKey: ["currentUser"],
    queryFn: UsersService.readUserMe,
    enabled: isLoaded && !!isSignedIn,
    staleTime: 1000 * 60 * 10,
    retry: 2,
    retryDelay: 1000,
  })

  const logout = async () => {
    await signOut()
    if (navigate) {
      navigate({ to: "/login" })
    } else {
      window.location.href = "/login"
    }
  }

  const value = useMemo(
    () => ({
      user,
      clerkUser,
      logout,
      isLoaded,
      isSignedIn: !!isSignedIn,
      orgId,
      orgRole,
      isOrgAdmin: orgRole === "org:admin",
    }),
    [user, clerkUser, isLoaded, isSignedIn, orgId, orgRole]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuthContext = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuthContext must be used within an AuthProvider")
  }
  return context
}
