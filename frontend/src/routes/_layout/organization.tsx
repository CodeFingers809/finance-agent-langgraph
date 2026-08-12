import { OrganizationSwitcher } from "@clerk/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { LogOut } from "lucide-react"
import { toast } from "sonner"

import { OrganizationsService } from "@/client/organizations"
import { InvitationsPanel } from "@/components/Organization/InvitationsPanel"
import { MembersTable } from "@/components/Organization/MembersTable"
import { OrgOverview } from "@/components/Organization/OrgOverview"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/organization")({
  component: OrganizationPage,
})

function OrganizationPage() {
  const queryClient = useQueryClient()
  const { clerkUser, isOrgAdmin } = useAuth()

  const { data, isLoading, error } = useQuery({
    queryKey: ["organization", "me"],
    queryFn: OrganizationsService.getMine,
  })

  const leaveMutation = useMutation({
    mutationFn: OrganizationsService.leave,
    onSuccess: () => {
      toast.success("You left the organization.")
      queryClient.invalidateQueries({ queryKey: ["organization"] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Couldn't load your organization
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{error.message}</p>
            <Button
              variant="outline"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ["organization"] })
              }
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const org = data?.organization

  // No active org: Clerk's switcher is the only way to create/select one, so
  // show it rather than a dead-end empty state.
  if (!org) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No active organization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Create or select an organization to share watchlists, portfolios,
              and research reports with your team.
            </p>
            <OrganizationSwitcher
              hidePersonal={false}
              appearance={{ elements: { organizationSwitcherPopoverActionButton__createOrganization: { display: "none" } } }}
            />

          </CardContent>
        </Card>
      </div>
    )
  }

  const members = data?.members ?? []

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{org.name}</h1>
          <p className="text-sm text-muted-foreground">
            {isOrgAdmin ? "You are an admin" : "You are an analyst"}
            {" · "}
            {members.length} {members.length === 1 ? "member" : "members"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <OrganizationSwitcher
            hidePersonal={false}
            appearance={{ elements: { organizationSwitcherPopoverActionButton__createOrganization: { display: "none" } } }}
          />

          <Button
            variant="outline"
            size="sm"
            disabled={leaveMutation.isPending}
            onClick={() => leaveMutation.mutate()}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Leave
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          {isOrgAdmin && (
            <TabsTrigger value="invitations">Invitations</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OrgOverview organization={org} memberCount={members.length} />
        </TabsContent>

        <TabsContent value="members" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <MembersTable
                members={members}
                canManage={isOrgAdmin}
                currentClerkUserId={clerkUser?.id}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {isOrgAdmin && (
          <TabsContent value="invitations" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <InvitationsPanel />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
