/**
 * Organization + research-report API.
 *
 * Hand-written because these routes aren't in the generated OpenAPI client yet.
 * Auth comes from OpenAPI.TOKEN, which ClerkTokenBridge keeps current.
 */
import { OpenAPI } from "./core/OpenAPI"

export type OrgRole = "org:admin" | "org:member"

export interface OrgMember {
  membership_id: string
  clerk_user_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  image_url: string | null
  role: OrgRole
}

export interface OrgSummary {
  id: string
  name: string
  slug: string | null
}

export interface MyOrganization {
  organization: OrgSummary | null
  role: OrgRole | null
  members: OrgMember[]
  user_email: string
}

export interface OrgInvitation {
  id: string
  email_address: string
  role: OrgRole
  status: string
  created_at: number | null
}

export interface OrgStats {
  saved_reports: number
  usage_by_member: { email: string; reports: number }[]
}

export interface ResearchReportListItem {
  id: string
  user_id: string
  symbol: string
  query: string
  title: string | null
  created_at: string | null
  created_by_model: string
}

export interface ResearchReportDetail extends ResearchReportListItem {
  org_id: string | null
  markdown_report: string
  conversation_id: string | null
  message_id: string | null
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token =
    typeof OpenAPI.TOKEN === "function"
      ? await (OpenAPI.TOKEN as () => Promise<string>)()
      : ((OpenAPI.TOKEN as string) ?? "")

  const res = await fetch(`${OpenAPI.BASE}/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })

  if (!res.ok) {
    // Surface the backend's `detail` so Clerk's messages (already a member,
    // already invited, ...) reach the user instead of a generic failure.
    let detail = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (typeof body?.detail === "string") detail = body.detail
    } catch {
      // non-JSON error body; keep the status-based message
    }
    throw new Error(detail)
  }

  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

export const OrganizationsService = {
  getMine: () => request<MyOrganization>("/organizations/me"),

  getStats: () => request<OrgStats>("/organizations/me/stats"),

  listInvitations: () =>
    request<{ invitations: OrgInvitation[] }>("/organizations/me/invitations"),

  invite: (email_address: string, role: OrgRole) =>
    request<OrgInvitation>("/organizations/me/invitations", {
      method: "POST",
      body: JSON.stringify({ email_address, role }),
    }),

  revokeInvitation: (invitationId: string) =>
    request<{ message: string }>(
      `/organizations/me/invitations/${invitationId}`,
      { method: "DELETE" },
    ),

  updateMemberRole: (clerkUserId: string, role: OrgRole) =>
    request<{ clerk_user_id: string; role: OrgRole }>(
      `/organizations/me/members/${clerkUserId}`,
      { method: "PATCH", body: JSON.stringify({ role }) },
    ),

  removeMember: (clerkUserId: string) =>
    request<{ message: string }>(`/organizations/me/members/${clerkUserId}`, {
      method: "DELETE",
    }),

  leave: () =>
    request<{ message: string }>("/organizations/me/leave", { method: "POST" }),
}

export const ResearchReportsService = {
  list: () => request<ResearchReportListItem[]>("/research-reports"),

  get: (id: string) => request<ResearchReportDetail>(`/research-reports/${id}`),

  create: (body: {
    markdown_report: string
    title?: string | null
    symbol?: string
    query?: string
    created_by_model?: string
    conversation_id?: string | null
    message_id?: string | null
  }) =>
    request<ResearchReportDetail>("/research-reports", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  update: (id: string, title: string) =>
    request<ResearchReportDetail>(`/research-reports/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),

  remove: (id: string) =>
    request<{ status: string; message: string }>(`/research-reports/${id}`, {
      method: "DELETE",
    }),
}
