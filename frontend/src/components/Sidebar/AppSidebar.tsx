import { Link, useLocation, useNavigate } from "@tanstack/react-router"
import {
  Check,
  Eye,
  MessageSquare,
  Pencil,
  PieChart,
  Plus,
  Trash2,
  Users,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { OpenAPI } from "@/client"
import { Logo } from "@/components/Common/Logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import useAuth from "@/hooks/useAuth"
import { User } from "./User"

interface ConversationItem {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export function AppSidebar() {
  const { user: currentUser } = useAuth()
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [editingConvId, setEditingConvId] = useState<string | null>(null)
  const [editTitleInput, setEditTitleInput] = useState("")

  const location = useLocation()
  const navigate = useNavigate()

  const fetchConversations = useCallback(async () => {
    try {
      const token = localStorage.getItem("access_token")
      if (!token) return
      const res = await fetch(`${OpenAPI.BASE}/api/v1/agent/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data: ConversationItem[] = await res.json()
        setConversations(data)
      }
    } catch (err) {
      console.error("Failed to fetch conversations for sidebar", err)
    }
  }, []) // No dependencies — fetch on mount only, then every 30s

  useEffect(() => {
    fetchConversations()
    // Refetch every 30 seconds (was 5s — causing thousands of requests)
    const interval = setInterval(fetchConversations, 30 * 1000)
    return () => clearInterval(interval)
  }, [fetchConversations])

  const handleNewChat = () => {
    navigate({ to: "/chat", search: {} as any })
  }

  const handleStartRename = (conv: ConversationItem, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setEditingConvId(conv.id)
    setEditTitleInput(conv.title)
  }

  const handleSaveRename = async (convId: string, e?: React.FormEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    if (!editTitleInput.trim()) return

    try {
      const token = localStorage.getItem("access_token")
      if (!token) return
      const res = await fetch(
        `${OpenAPI.BASE}/api/v1/agent/conversations/${convId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ title: editTitleInput.trim() }),
        },
      )
      if (res.ok) {
        setEditingConvId(null)
        fetchConversations()
      }
    } catch (err) {
      console.error("Rename conversation error", err)
    }
  }

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      const token = localStorage.getItem("access_token")
      if (!token) return
      await fetch(`${OpenAPI.BASE}/api/v1/agent/conversations/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      fetchConversations()
      const currentConvId = (location.search as any)?.convId
      if (currentConvId === id) {
        navigate({ to: "/chat", search: {} as any })
      }
    } catch (err) {
      console.error("Delete conversation error", err)
    }
  }

  const activeConvId = (location.search as any)?.convId

  return (
    <Sidebar
      collapsible="none"
      className="border-r-2 border-[#27272A] bg-[#F4EFE6] text-[#27272A] h-screen h-full flex flex-col justify-between"
    >
      <SidebarHeader className="px-3 py-4 border-b-2 border-[#27272A] bg-[#F4EFE6]">
        <div className="flex items-center justify-between gap-2">
          <Logo variant="full" />
        </div>
        <div className="mt-3">
          <Button
            onClick={handleNewChat}
            className="w-full gap-2 justify-center neubrutal-btn-primary text-xs h-9 px-3"
            size="sm"
          >
            <Plus className="h-4 w-4" /> New Chat
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent className="flex flex-col justify-between flex-1 bg-[#F4EFE6]">
        {/* Top Section: Active Chat Threads */}
        <SidebarGroup className="flex-1 overflow-hidden p-3">
          <SidebarGroupContent className="overflow-y-auto max-h-[calc(100vh-18rem)] pr-1">
            <SidebarMenu className="space-y-1">
              {conversations.map((conv) => (
                <SidebarMenuItem key={conv.id}>
                  {editingConvId === conv.id ? (
                    <form
                      onSubmit={(e) => handleSaveRename(conv.id, e)}
                      className="flex items-center gap-1.5 w-full py-1"
                    >
                      <Input
                        value={editTitleInput}
                        onChange={(e) => setEditTitleInput(e.target.value)}
                        autoFocus
                        className="h-7 text-xs border border-[#27272A] bg-white px-2 font-semibold text-[#27272A]"
                      />
                      <Button
                        type="submit"
                        size="icon"
                        className="h-7 w-7 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    </form>
                  ) : (
                    <SidebarMenuButton
                      asChild
                      isActive={
                        location.pathname === "/chat" &&
                        activeConvId === conv.id
                      }
                      className="group relative flex items-center justify-between text-xs py-2 px-3 rounded border border-[#27272A] w-full bg-white hover:bg-amber-100 transition-colors text-[#27272A]"
                    >
                      <Link to="/chat" search={{ convId: conv.id } as any}>
                        <div className="flex items-center gap-2 truncate">
                          <MessageSquare className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="truncate font-semibold text-[#27272A]">
                            {conv.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 hover:text-black hover:bg-amber-200"
                            onClick={(e) => handleStartRename(conv, e)}
                            title="Rename chat"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) =>
                              handleDeleteConversation(conv.id, e)
                            }
                            title="Delete chat"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </Link>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}

              {conversations.length === 0 && (
                <div className="px-3 py-4 text-center text-[11px] text-muted-foreground italic">
                  No active chats yet.
                </div>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Bottom Section: Portfolios, Watchlists & User Settings */}
        <SidebarGroup className="p-2 space-y-1 mt-auto bg-[#F4EFE6]">
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === "/portfolios"}
                >
                  <Link
                    to="/portfolios"
                    className="flex items-center gap-2.5 text-xs font-bold text-[#27272A] p-2 hover:bg-amber-100 rounded transition-colors"
                  >
                    <PieChart className="h-4 w-4 text-indigo-600" />
                    <span>Portfolios</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === "/watchlists"}
                >
                  <Link
                    to="/watchlists"
                    className="flex items-center gap-2.5 text-xs font-bold text-[#27272A] p-2 hover:bg-amber-100 rounded transition-colors"
                  >
                    <Eye className="h-4 w-4 text-amber-600" />
                    <span>Watchlists</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {currentUser?.is_superuser && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === "/admin"}
                  >
                    <Link
                      to="/admin"
                      className="flex items-center gap-2.5 text-xs font-bold text-[#27272A] p-2 hover:bg-amber-100 rounded transition-colors"
                    >
                      <Users className="h-4 w-4 text-purple-600" />
                      <span>Admin</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2 bg-[#F4EFE6]">
        <User user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  )
}

export default AppSidebar
