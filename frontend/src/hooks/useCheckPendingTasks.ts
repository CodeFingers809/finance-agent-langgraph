import { useClerk } from "@clerk/react"
import { useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"
import { toast } from "sonner"
import useAuth from "./useAuth"

/**
 * Check if the user has pending tasks (e.g., choose-organization) and redirect if needed.
 * Call this in protected routes to ensure users complete org setup before accessing content.
 */
export function useCheckPendingTasks() {
  const navigate = useNavigate()
  const { session } = useClerk()
  const { isLoaded } = useAuth()

  useEffect(() => {
    if (!isLoaded || !session) return

    // Check for pending tasks in Clerk session
    const metadata = session.user?.unsafeMetadata as any
    const tasks = metadata?.tasks || []

    if (Array.isArray(tasks) && tasks.length > 0) {
      const taskKeys = tasks.map((t: any) => t.key).join(", ")
      console.debug("Pending tasks detected:", taskKeys)

      // Tasks that require org setup
      if (tasks.some((t: any) => t.key === "choose-organization")) {
        toast.info("Please select or create your organization")
        navigate({ to: "/setup-organization", replace: true })
      }
    }
  }, [isLoaded, session, navigate])
}
