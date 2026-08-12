import { useOrganization, useOrganizationList } from "@clerk/react"
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"

import { HeaderControls } from "@/components/Common/HeaderControls"
import AppSidebar from "@/components/Sidebar/AppSidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import useAuth from "@/hooks/useAuth"
import { useCheckPendingTasks } from "@/hooks/useCheckPendingTasks"

// No beforeLoad auth check: it runs before React mounts, so the Clerk token
// bridge isn't installed yet and any API call from here 401s -- which used to
// bounce to /login, whose own guard bounced back, looping forever. Auth is
// gated in the component below, where Clerk's hooks are available.


export const Route = createFileRoute("/_layout")({
  component: Layout,
})

function Layout() {
  const navigate = useNavigate()
  const { isLoaded, isSignedIn } = useAuth()
  const { organization } = useOrganization()
  const { userMemberships, setActive } = useOrganizationList({
    userMemberships: { infinite: true },
  })

  // Check for pending tasks and redirect if needed
  useCheckPendingTasks()

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      navigate({ to: "/login", replace: true })
    }
  }, [isLoaded, isSignedIn, navigate])

  // If user has no org memberships, redirect to setup-organization
  useEffect(() => {
    if (
      isLoaded &&
      isSignedIn &&
      userMemberships?.data &&
      userMemberships.data.length === 0
    ) {
      navigate({ to: "/setup-organization", replace: true })
      return
    }
  }, [isLoaded, isSignedIn, userMemberships?.data, navigate])

  // Activate the user's first org so org-scoped requests carry an org_id.
  useEffect(() => {
    if (
      !organization &&
      userMemberships?.data &&
      userMemberships.data.length > 0 &&
      setActive
    ) {
      setActive({ organization: userMemberships.data[0].organization.id })
    }
  }, [organization, userMemberships?.data, setActive])

  // Render nothing until Clerk resolves and confirms user is signed in
  if (!isLoaded || !isSignedIn) return null



  return (
    <SidebarProvider
      defaultOpen={true}
      className="h-screen w-full flex overflow-hidden bg-[#FAF6F0]"
    >
      <AppSidebar />
      <SidebarInset className="bg-[#FAF6F0] text-[#27272A] flex flex-col h-screen flex-1 overflow-hidden m-0 rounded-none border-none shadow-none">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-4 border-b-2 border-[#27272A] px-6 bg-[#FAF6F0]">
          <HeaderControls />
        </header>
        <main className="flex-1 bg-[#FAF6F0] overflow-y-auto p-0 m-0 w-full h-full relative">
          <Outlet />
        </main>

      </SidebarInset>
    </SidebarProvider>
  )
}
