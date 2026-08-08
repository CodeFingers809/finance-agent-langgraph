import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Suspense, useState } from "react"

import { type UserPublic, UsersService } from "@/client"
import AddUser from "@/components/Admin/AddUser"
import { columns, type UserTableData } from "@/components/Admin/columns"
import { DataTable } from "@/components/Common/DataTable"
import PendingUsers from "@/components/Pending/PendingUsers"
import { LangSmithDashboard } from "@/components/Admin/LangSmithDashboard"
import useAuth from "@/hooks/useAuth"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
  const [activeTab, setActiveTab] = useState("users")

  return (
    <div className="p-6 space-y-6 bg-[#FAF6F0] min-h-full text-[#27272A]">
      <div className="border-b-2 border-[#27272A] pb-4">
        <h1 className="text-3xl font-display font-extrabold tracking-tight text-[#27272A]">
          Administration
        </h1>
        <p className="text-xs text-[#52525B]">
          Manage users, permissions, and system observability.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-white border-2 border-[#27272A] shadow-[2px_2px_0px_#27272A]">
          <TabsTrigger value="users">Users & Permissions</TabsTrigger>
          <TabsTrigger value="observability">Observability</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <div className="flex items-center justify-between">
            <div />
            <AddUser />
          </div>
          <UsersTable />
        </TabsContent>

        <TabsContent value="observability" className="space-y-4">
          <div className="bg-white border-2 border-[#27272A] shadow-[4px_4px_0px_#27272A] rounded-xl p-6">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-[#27272A] mb-2">LangSmith Observability</h2>
              <p className="text-sm text-[#52525B]">
                Real-time metrics from LangSmith tracing (last 7 days, updated every 30 seconds)
              </p>
            </div>
            <LangSmithDashboard />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
