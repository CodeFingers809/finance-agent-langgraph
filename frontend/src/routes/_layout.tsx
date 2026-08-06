import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"

import AppSidebar from "@/components/Sidebar/AppSidebar"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { isLoggedIn } from "@/hooks/useAuth"
import { UsersService } from "@/client"
import { HeaderControls } from "@/components/Common/HeaderControls"

export const Route = createFileRoute("/_layout")({
  component: Layout,
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({
        to: "/login",
      })
    }
    try {
      await UsersService.readUserMe()
    } catch (err) {
      localStorage.removeItem("access_token")
      throw redirect({
        to: "/login",
      })
    }
  },
})

function Layout() {
  return (
    <SidebarProvider defaultOpen={true} className="h-screen w-full flex overflow-hidden bg-[#FAF6F0]">
      <AppSidebar />
      <SidebarInset className="bg-[#FAF6F0] text-[#27272A] flex flex-col h-screen flex-1 overflow-hidden m-0 rounded-none border-none shadow-none">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-4 border-b-2 border-[#27272A] px-6 bg-[#FAF6F0]">
          <HeaderControls />
        </header>
        <main className="flex-1 bg-[#FAF6F0] overflow-hidden p-0 m-0 w-full h-full relative">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
