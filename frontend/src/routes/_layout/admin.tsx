import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Suspense } from "react"

import { type UserPublic, UsersService } from "@/client"
import AddUser from "@/components/Admin/AddUser"
import { columns, type UserTableData } from "@/components/Admin/columns"
import { DataTable } from "@/components/Common/DataTable"
import PendingUsers from "@/components/Pending/PendingUsers"
import useAuth from "@/hooks/useAuth"

function getUsersQueryOptions() {
  return {
    queryFn: () => UsersService.readUsers({ skip: 0, limit: 100 }),
    queryKey: ["users"],
  }
}

export const Route = createFileRoute("/_layout/admin")({
  component: Admin,
  beforeLoad: async () => {
    const user = await UsersService.readUserMe()
    if (!user.is_superuser) {
      throw redirect({
        to: "/",
      })
    }
  },
  head: () => ({
    meta: [
      {
        title: "Admin - Finance Agent",
      },
    ],
  }),
})

function UsersTableContent() {
  const { user: currentUser } = useAuth()
  const { data: users } = useSuspenseQuery(getUsersQueryOptions())

  const tableData: UserTableData[] = users.data.map((user: UserPublic) => ({
    ...user,
    isCurrentUser: currentUser?.id === user.id,
  }))

  return (
    <div className="bg-white border-2 border-[#27272A] shadow-[4px_4px_0px_#27272A] rounded-xl p-4 overflow-hidden">
      <DataTable columns={columns} data={tableData} />
    </div>
  )
}

function UsersTable() {
  return (
    <Suspense fallback={<PendingUsers />}>
      <UsersTableContent />
    </Suspense>
  )
}

function Admin() {
  return (
    <div className="p-6 space-y-6 bg-[#FAF6F0] min-h-full text-[#27272A]">
      <div className="flex items-center justify-between border-b-2 border-[#27272A] pb-4">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight text-[#27272A]">Users & Permissions</h1>
          <p className="text-xs text-[#52525B]">
            Manage user accounts, roles, and administrative access.
          </p>
        </div>
        <AddUser />
      </div>
      <UsersTable />
    </div>
  )
}
