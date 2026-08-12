import { useClerk, useOrganizationList } from "@clerk/react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { authFetch } from "@/lib/authFetch"
import { AuthLayout } from "@/components/Common/AuthLayout"
import { LoadingButton } from "@/components/ui/loading-button"
import { Input } from "@/components/ui/input"

export const Route = createFileRoute("/setup-organization")({
  component: SetupOrganization,
  head: () => ({
    meta: [
      {
        title: "Setup Organization - Finance Agent",
      },
    ],
  }),
})

function SetupOrganization() {
  const navigate = useNavigate()
  const { setActive } = useClerk()
  const { userMemberships, isLoaded: isOrgsLoaded } = useOrganizationList({
    userMemberships: { infinite: true },
  })
  const [orgName, setOrgName] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // If Clerk is loaded and user has at least 1 org, immediately redirect to /chat!
    if (isOrgsLoaded && userMemberships?.data && userMemberships.data.length > 0) {
      const firstOrgId = userMemberships.data[0].organization.id
      if (setActive) {
        setActive({ organization: firstOrgId })
      }
      navigate({ to: "/chat", replace: true })
    }
  }, [isOrgsLoaded, userMemberships?.data, setActive, navigate])

  const handleSetupOrg = async (e: React.FormEvent) => {
    e.preventDefault()

    // STRICT GUARD: Only create an org if all checks confirm user has NO orgs!
    if (userMemberships?.data && userMemberships.data.length > 0) {
      const firstOrgId = userMemberships.data[0].organization.id
      if (setActive) {
        await setActive({ organization: firstOrgId })
      }
      toast.info("You already belong to an organization.")
      navigate({ to: "/chat", replace: true })
      return
    }

    if (!orgName.trim() || loading) {
      if (!orgName.trim()) toast.error("Organization name is required")
      return
    }

    setLoading(true)
    try {
      const response = await authFetch("/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: orgName.trim() }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        toast.error(error.detail || "Failed to create organization")
        setLoading(false)
        return
      }

      const org = await response.json()

      if (org.id && setActive) {
        await setActive({ organization: org.id })
        toast.success("Organization created successfully!")
        navigate({ to: "/chat", replace: true })
      }
    } catch (err: any) {


      const msg =
        err?.body?.detail ||
        err?.message ||
        "Failed to create organization. Please try again."

      if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("member")) {
        // If user is already in an org, redirect to /chat
        navigate({ to: "/chat", replace: true })
        return
      }

      toast.error(msg)
      setLoading(false)
    }
  }

  // Show loading while checking org memberships
  if (!isOrgsLoaded || (userMemberships?.data && userMemberships.data.length > 0)) {
    return (
      <AuthLayout>
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Loading your workspace</h1>
            <p className="text-xs text-[#52525B] mt-2">Preparing your dashboard...</p>
          </div>
        </div>
      </AuthLayout>
    )
  }


  return (
    <AuthLayout>
      <form onSubmit={handleSetupOrg} className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-bold">Set up your workspace</h1>
          <p className="text-xs text-[#52525B]">
            Give your organization a name to get started
          </p>
        </div>

        <div className="grid gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="org-name" className="text-xs font-bold text-[#27272A]">
              Organization Name
            </label>
            <Input
              id="org-name"
              data-testid="org-name-input"
              placeholder="e.g., My Company"
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <LoadingButton type="submit" className="w-full" loading={loading}>
            Create Organization
          </LoadingButton>
        </div>
      </form>
    </AuthLayout>
  )
}
