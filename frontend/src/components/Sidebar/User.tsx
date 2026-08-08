import { Link as RouterLink } from "@tanstack/react-router"
import { ChevronsUpDown, LogOut, Settings } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import useAuth from "@/hooks/useAuth"
import { getInitials } from "@/utils"

interface UserInfoProps {
  fullName?: string
  email?: string
}

function UserInfo({ fullName, email }: UserInfoProps) {
  return (
    <div className="flex items-center gap-2.5 w-full min-w-0">
      <Avatar className="size-8 border border-[#27272A]">
        <AvatarFallback className="bg-amber-200 text-[#27272A] font-extrabold text-xs">
          {getInitials(fullName || "User")}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col items-start min-w-0">
        <p className="text-xs font-bold text-[#27272A] truncate w-full">
          {fullName || "User Account"}
        </p>
        <p className="text-[11px] text-[#52525B] truncate w-full">{email}</p>
      </div>
    </div>
  )
}

export function User({ user }: { user: any }) {
  const { logout } = useAuth()
  const { isMobile, setOpenMobile } = useSidebar()

  if (!user) return null

  const handleMenuClick = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }
  const handleLogout = async () => {
    logout()
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="w-full flex items-center justify-between p-2 bg-white border-2 border-[#27272A] shadow-[2px_2px_0px_#27272A] rounded-lg hover:bg-amber-100 transition-colors text-left"
              data-testid="user-menu"
            >
              <UserInfo fullName={user?.full_name} email={user?.email} />
              <ChevronsUpDown className="ml-auto size-4 text-[#27272A] shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-56 rounded-lg bg-white border-2 border-[#27272A] shadow-[3px_3px_0px_#27272A] p-2"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={6}
          >
            <DropdownMenuLabel className="p-1 font-normal border-b border-[#27272A] pb-2 mb-1">
              <UserInfo fullName={user?.full_name} email={user?.email} />
            </DropdownMenuLabel>
            <RouterLink to="/settings" onClick={handleMenuClick}>
              <DropdownMenuItem className="gap-2 font-bold text-xs hover:bg-amber-100 cursor-pointer rounded p-2 text-[#27272A]">
                <Settings className="h-4 w-4" />
                <span>User Settings</span>
              </DropdownMenuItem>
            </RouterLink>
            <DropdownMenuSeparator className="bg-[#27272A]" />
            <DropdownMenuItem
              onClick={handleLogout}
              className="gap-2 font-bold text-xs text-rose-600 hover:bg-rose-100 cursor-pointer rounded p-2"
            >
              <LogOut className="h-4 w-4" />
              <span>Log Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
