import { useOrganization, useOrganizationList } from "@clerk/react"
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router"
import { useEffect, useRef } from "react"

import { CustomSpinner } from "@/components/Common/CustomSpinner"
import { HeaderControls } from "@/components/Common/HeaderControls"
import AppSidebar from "@/components/Sidebar/AppSidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import useAuth, { isLoggedIn } from "@/hooks/useAuth"
import { useCheckPendingTasks } from "@/hooks/useCheckPendingTasks"

export const Route = createFileRoute("/_layout")({
  component: Layout,
})

function Layout() {
  const navigate = useNavigate()
  const { isLoaded, isSignedIn } = useAuth()
  const { organization } = useOrganization()
  const { userMemberships, isLoaded: isOrgsLoaded, setActive } = useOrganizationList({
    userMemberships: { infinite: true },
  })
  const activatingRef = useRef(false)

  // Check for pending tasks and redirect if needed
  useCheckPendingTasks()

  useEffect(() => {
    // Only redirect to login if Clerk is fully loaded AND user is NOT signed in AND cookie hint confirms no session
    if (isLoaded && !isSignedIn && !isLoggedIn()) {
      navigate({ to: "/login", replace: true })
    }
  }, [isLoaded, isSignedIn, navigate])

  // If user has no org memberships after orgs list is fully loaded, redirect to setup-organization
  useEffect(() => {
    if (
      isLoaded &&
      isSignedIn &&
      isOrgsLoaded &&
      !userMemberships.isLoading &&
      userMemberships?.data &&
      userMemberships.data.length === 0
    ) {
      navigate({ to: "/setup-organization", replace: true })
    }
  }, [isLoaded, isSignedIn, isOrgsLoaded, userMemberships.isLoading, userMemberships?.data, navigate])

  // Activate the user's first org so org-scoped requests carry an org_id.
  useEffect(() => {
    if (
      !organization &&
      userMemberships?.data &&
      userMemberships.data.length > 0 &&
      setActive &&
      !activatingRef.current
    ) {
      activatingRef.current = true
      setActive({ organization: userMemberships.data[0].organization.id }).finally(() => {
        activatingRef.current = false
      })
    }
  }, [organization, userMemberships?.data, setActive])

  // Render persistent layout shell while Clerk is hydrating session instead of blank screen
  if (!isLoaded || (!isSignedIn && isLoggedIn())) {
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
          <main className="flex-1 bg-[#FAF6F0] flex items-center justify-center p-0 m-0 w-full h-full relative">
            <CustomSpinner size="md" />
          </main>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  if (!isSignedIn && !isLoggedIn()) return null




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
