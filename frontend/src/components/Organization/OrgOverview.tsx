import { useQuery } from "@tanstack/react-query"
import { FileText, Users } from "lucide-react"

import { OrganizationsService, type OrgSummary } from "@/client/organizations"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface OrgOverviewProps {
  readonly organization: OrgSummary
  readonly memberCount: number
}

export function OrgOverview({ organization, memberCount }: OrgOverviewProps) {
  const { data: stats } = useQuery({
    queryKey: ["organization", "stats"],
    queryFn: OrganizationsService.getStats,
  })

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Users className="h-4 w-4" />
              Members
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{memberCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileText className="h-4 w-4" />
              Saved reports
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {stats?.saved_reports ?? "--"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Organization
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="truncate text-lg font-semibold">
              {organization.name}
            </p>
            {organization.slug && (
              <p className="truncate text-xs text-muted-foreground">
                {organization.slug}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI usage by member</CardTitle>
        </CardHeader>
        <CardContent>
          {!stats?.usage_by_member?.length ? (
            <p className="text-sm text-muted-foreground">
              No reports saved yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead className="text-right">Reports saved</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.usage_by_member.map((row) => (
                  <TableRow key={row.email}>
                    <TableCell className="truncate">{row.email}</TableCell>
                    <TableCell className="text-right">{row.reports}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
