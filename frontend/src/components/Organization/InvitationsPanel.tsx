import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Mail, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { type OrgRole, OrganizationsService } from "@/client/organizations"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function InvitationsPanel() {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<OrgRole>("org:member")

  const { data, isLoading } = useQuery({
    queryKey: ["organization", "invitations"],
    queryFn: OrganizationsService.listInvitations,
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["organization", "invitations"] })

  const inviteMutation = useMutation({
    mutationFn: () => OrganizationsService.invite(email.trim(), role),
    onSuccess: () => {
      toast.success(`Invitation sent to ${email.trim()}`)
      setEmail("")
      setRole("org:member")
      invalidate()
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => OrganizationsService.revokeInvitation(id),
    onSuccess: () => {
      toast.success("Invitation revoked")
      invalidate()
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const invitations = data?.invitations ?? []

  return (
    <div className="space-y-6">
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault()
          if (email.trim()) inviteMutation.mutate()
        }}
      >
        <div className="flex-1 space-y-2">
          <Label htmlFor="invite-email">Email address</Label>
          <Input
            id="invite-email"
            type="email"
            required
            placeholder="analyst@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2 sm:w-40">
          <Label htmlFor="invite-role">Role</Label>
          <Select
            value={role}
            onValueChange={(v) => setRole(v as OrgRole)}
          >
            <SelectTrigger id="invite-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="org:member">Analyst</SelectItem>
              <SelectItem value="org:admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="submit"
          disabled={!email.trim() || inviteMutation.isPending}
        >
          <Mail className="mr-2 h-4 w-4" />
          {inviteMutation.isPending ? "Sending..." : "Send invite"}
        </Button>
      </form>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">Pending invitations</h4>
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading...</p>
        )}
        {!isLoading && invitations.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No pending invitations.
          </p>
        )}
        {invitations.map((inv) => (
          <div
            key={inv.id}
            className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
          >
            <div className="min-w-0">
              <div className="truncate text-sm">{inv.email_address}</div>
              <div className="text-xs text-muted-foreground">
                {inv.role === "org:admin" ? "Admin" : "Analyst"}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="outline">{inv.status}</Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={`Revoke invitation for ${inv.email_address}`}
                disabled={revokeMutation.isPending}
                onClick={() => revokeMutation.mutate(inv.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
