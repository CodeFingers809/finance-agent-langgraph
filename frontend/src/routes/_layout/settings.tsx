import { createFileRoute } from "@tanstack/react-router"
import ChangePassword from "@/components/UserSettings/ChangePassword"
import DeleteAccount from "@/components/UserSettings/DeleteAccount"
import UserInformation from "@/components/UserSettings/UserInformation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import useAuth from "@/hooks/useAuth"

const tabsConfig = [
  { value: "my-profile", title: "My profile", component: UserInformation },
  { value: "password", title: "Password", component: ChangePassword },
  { value: "danger-zone", title: "Danger zone", component: DeleteAccount },
]

export const Route = createFileRoute("/_layout/settings")({
  component: UserSettings,
  head: () => ({
    meta: [
      {
        title: "Settings - Finance Agent",
      },
    ],
  }),
})

function UserSettings() {
  const { user: currentUser } = useAuth()
  const finalTabs = currentUser?.is_superuser
    ? tabsConfig.slice(0, 3)
    : tabsConfig

  if (!currentUser) {
    return null
  }

  return (
    <div className="p-6 space-y-6 bg-[#FAF6F0] min-h-full text-[#27272A]">
      <div className="border-b-2 border-[#27272A] pb-4">
        <h1 className="text-3xl font-display font-extrabold tracking-tight text-[#27272A]">
          User Settings
        </h1>
        <p className="text-xs text-[#52525B]">
          Manage your account profile, authentication password, and security
          preferences.
        </p>
      </div>

      <Tabs defaultValue="my-profile" className="space-y-6">
        <TabsList className="bg-transparent border-0 p-0 shadow-none rounded-none flex flex-wrap gap-3">
          {finalTabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="data-[state=active]:bg-[#2563EB] data-[state=active]:text-white bg-white text-[#27272A] hover:bg-amber-100 font-extrabold text-xs px-4 py-2.5 rounded-md border-2 border-[#27272A] shadow-[2px_2px_0px_#27272A] transition-all"
            >
              {tab.title}
            </TabsTrigger>
          ))}
        </TabsList>

        {finalTabs.map((tab) => (
          <TabsContent
            key={tab.value}
            value={tab.value}
            className="bg-white border-2 border-[#27272A] shadow-[4px_4px_0px_#27272A] rounded-xl p-6"
          >
            <tab.component />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
