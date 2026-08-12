import { useClerk } from "@clerk/react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { toast } from "sonner"
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
  const { user, setActive } = useClerk()
  const [orgName, setOrgName] = useState("")
  const [loading, setLoading] = useState(false)
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)

  useEffect(() => {
    // If user is not signed in, redirect to signup
    if (!user) {
      navigate({ to: "/signup", replace: true })
      return
    }

    // Check if user already has an organization
    if (user.organizationMemberships && user.organizationMemberships.length > 0) {
      // User already has an org, auto-select the first one and move to chat
      const firstOrg = user.organizationMemberships[0]
      if (firstOrg.organization?.id) {
        setSelectedOrgId(firstOrg.organization.id)
      }
    }
  }, [user, navigate])

  // Auto-submit when org is detected
  useEffect(() => {
    if (selectedOrgId && !loading) {
      handleSetupOrgWithId(selectedOrgId)
    }
  }, [selectedOrgId])

  const handleSetupOrgWithId = async (orgId: string) => {
    setLoading(true)
    try {
      // Set active org to resolve choose-organization task
      await setActive({ organization: orgId })
      await new Promise(resolve => setTimeout(resolve, 200))
      toast.success("Organization selected!")
      navigate({ to: "/chat", replace: true })
    } catch (err: any) {
      const msg = err?.message || "Failed to select organization. Please try again."
      toast.error(msg)
      setLoading(false)
    }
  }

  const handleSetupOrg = async (e: React.FormEvent) => {
    e.preventDefault()

    setLoading(true)
    try {
      // If user already has an org membership, just select it and move on
      if (selectedOrgId) {
        await handleSetupOrgWithId(selectedOrgId)
        return
      }

      // Need to create new org
      if (!orgName.trim()) {
        toast.error("Organization name is required")
        setLoading(false)
        return
      }

      // Create a new organization with the provided name
      const response = await fetch("/api/v1/organizations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: orgName.trim(),
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        toast.error(error.detail || "Failed to create organization")
        setLoading(false)
        return
      }

      const org = await response.json()

      // Set the created organization as active to resolve any pending tasks
      if (org.id) {
        await setActive({ organization: org.id })
        await new Promise(resolve => setTimeout(resolve, 200))
        toast.success("Organization created successfully!")
        navigate({ to: "/chat", replace: true })
      }
    } catch (err: any) {
      const msg =
        err?.message ||
        "Failed to create organization. Please try again."
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSetupOrg} className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-bold">Set up your workspace</h1>
          <p className="text-xs text-[#52525B]">
            {selectedOrgId
              ? "Ready to access your workspace"
              : "Give your organization a name to get started"}
          </p>
        </div>

        <div className="grid gap-4">
          {!selectedOrgId && (
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
          )}

          <LoadingButton type="submit" className="w-full" loading={loading}>
            {selectedOrgId ? "Continue to Dashboard" : "Create Organization"}
          </LoadingButton>
        </div>
      </form>
    </AuthLayout>
  )
}
