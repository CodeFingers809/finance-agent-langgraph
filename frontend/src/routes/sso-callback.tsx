import { AuthenticateWithRedirectCallback } from "@clerk/react"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/sso-callback")({
  component: SsoCallback,
})

function SsoCallback() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#FAF6F0] p-4 text-[#27272A]">
      <div className="neubrutal-card p-8 text-center max-w-md w-full bg-white border-2 border-[#27272A] shadow-[4px_4px_0px_#27272A] rounded-xl">
        <h2 className="text-xl font-extrabold mb-2 font-display">Completing Sign In...</h2>
        <p className="text-xs text-[#52525B] mb-4">Please wait while we authenticate your account.</p>
        <AuthenticateWithRedirectCallback
          signInForceRedirectUrl="/chat"
          signUpForceRedirectUrl="/chat"
        />
      </div>
    </div>
  )
}
