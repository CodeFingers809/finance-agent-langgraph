import { useMutation, useQueryClient } from "@tanstack/react-query"
import { MoreHorizontal, Shield, UserMinus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  type OrgMember,
  type OrgRole,
  OrganizationsService,
} from "@/client/organizations"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface MembersTableProps {
  readonly members: OrgMember[]
  readonly canManage: boolean
  readonly currentClerkUserId: string | undefined
}

function initials(member: OrgMember): string {
  const first = member.first_name?.[0] ?? ""
  const last = member.last_name?.[0] ?? ""
  return (first + last || member.email?.[0] || "?").toUpperCase()
}

function displayName(member: OrgMember): string {
  const name = [member.first_name, member.last_name].filter(Boolean).join(" ")
  return name || member.email || member.clerk_user_id
}

export function MembersTable({
  members,
  canManage,
  currentClerkUserId,
}: MembersTableProps) {
  const queryClient = useQueryClient()
  const [pendingRemoval, setPendingRemoval] = useState<OrgMember | null>(null)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["organization", "me"] })
    queryClient.invalidateQueries({ queryKey: ["organization", "stats"] })
  }

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: OrgRole }) =>
      OrganizationsService.updateMemberRole(id, role),
    onSuccess: (_data, variables) => {
      toast.success(
        `Role updated to ${variables.role === "org:admin" ? "Admin" : "Analyst"}`,
      )
      invalidate()
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => OrganizationsService.removeMember(id),
    onSuccess: () => {
      toast.success("Member removed. They now have their own workspace.")
      setPendingRemoval(null)
      invalidate()
    },
    onError: (error: Error) => {
      toast.error(error.message)
      setPendingRemoval(null)
    },
  })

  if (members.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No members yet. Invite someone to get started.
      </p>
    )
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
            {canManage && <TableHead className="w-12" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => {
            const isSelf = member.clerk_user_id === currentClerkUserId
            return (
              <TableRow key={member.membership_id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={member.image_url ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {initials(member)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {displayName(member)}
                        {isSelf && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (you)
                          </span>
                        )}
                      </div>
                      {member.email && displayName(member) !== member.email && (
                        <div className="truncate text-xs text-muted-foreground">
                          {member.email}
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      member.role === "org:admin" ? "default" : "secondary"
                    }
                  >
                    {member.role === "org:admin" ? "Admin" : "Analyst"}
                  </Badge>
                </TableCell>
                {canManage && (
                  <TableCell>
                    {/* Admins can't change their own role or remove themselves;
                        the backend enforces this too. */}
                    {!isSelf && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={`Manage ${displayName(member)}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Change role</DropdownMenuLabel>
                          <DropdownMenuItem
                            disabled={
                              member.role === "org:admin" ||
                              roleMutation.isPending
                            }
                            onClick={() =>
                              roleMutation.mutate({
                                id: member.clerk_user_id,
                                role: "org:admin",
                              })
                            }
                          >
                            <Shield className="mr-2 h-4 w-4" />
                            Make Admin
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={
                              member.role === "org:member" ||
                              roleMutation.isPending
                            }
                            onClick={() =>
                              roleMutation.mutate({
                                id: member.clerk_user_id,
                                role: "org:member",
                              })
                            }
                          >
                            <Shield className="mr-2 h-4 w-4" />
                            Make Analyst
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setPendingRemoval(member)}
                          >
                            <UserMinus className="mr-2 h-4 w-4" />
                            Remove from organization
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <Dialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => !open && setPendingRemoval(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member?</DialogTitle>
            <DialogDescription>
              {pendingRemoval && displayName(pendingRemoval)} will lose access to
              this organization's watchlists, portfolios, and reports. They'll be
              moved to their own personal workspace.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingRemoval(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={removeMutation.isPending}
              onClick={() =>
                pendingRemoval &&
                removeMutation.mutate(pendingRemoval.clerk_user_id)
              }
            >
              {removeMutation.isPending ? "Removing..." : "Remove member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
