import { useSignIn } from "@clerk/react/legacy"
import { useClerk } from "@clerk/react"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  createFileRoute,
  Link as RouterLink,
  useNavigate,
} from "@tanstack/react-router"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { ArrowRight, LogOut, User } from "lucide-react"

import type { Body_login_login_access_token as AccessToken } from "@/client"
import { AuthLayout } from "@/components/Common/AuthLayout"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/ui/loading-button"
import { PasswordInput } from "@/components/ui/password-input"
import useAuth from "@/hooks/useAuth"

/**
 * Actionable messages for incomplete sign-in statuses.
 *
 * `needs_identifier`/`needs_first_factor` mean the credentials were rejected;
 * the rest signal Clerk instance settings (device trust, MFA, password reset)
 * that would each need their own UI step.
 */
const SIGN_IN_STEP_MESSAGES: Record<string, string> = {
  needs_identifier: "Incorrect email or password.",
  needs_first_factor: "Incorrect email or password.",
  needs_client_trust:
    "This device needs verification. Disable password device trust in Clerk, or sign in with Google.",
  needs_second_factor: "Two-factor authentication is required for this account.",
  needs_new_password: "Your password must be reset before signing in.",
}

/** Pull the human-readable message out of a Clerk API error. */
export function clerkErrorMessage(err: unknown, fallback: string): string {
  const errors = (err as { errors?: { longMessage?: string; message?: string }[] })
    ?.errors
  if (errors?.length) {
    return errors[0].longMessage || errors[0].message || fallback
  }
  return err instanceof Error ? err.message : fallback
}

const formSchema = z.object({
  username: z.email({ message: "Invalid email address" }),
  password: z
    .string()
    .min(1, { message: "Password is required" })
    .min(8, { message: "Password must be at least 8 characters" }),
}) satisfies z.ZodType<AccessToken>

type FormData = z.infer<typeof formSchema>

export const Route = createFileRoute("/login")({
  component: Login,

  head: () => ({
    meta: [
      {
        title: "Log In - FastAPI Template",
      },
    ],
  }),
})

function Login() {
  const navigate = useNavigate()
  const { isSignedIn, clerkUser, logout } = useAuth()
  const { isLoaded, signIn, setActive } = useSignIn()
  const { signOut } = useClerk()
  const [loading, setLoading] = useState(false)

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      username: "",
      password: "",
    },
  })

  const onSubmit = async (data: FormData) => {
    if (loading || !isLoaded || !signIn) return
    setLoading(true)
    try {
      if (isSignedIn && signOut) {
        await signOut()
      }
      const result = await signIn.create({
        identifier: data.username,
        password: data.password,
      })

      if (result.status !== "complete") {
        toast.error(SIGN_IN_STEP_MESSAGES[result.status ?? ""] ?? `Sign-in needs an extra step (${result.status}).`)
        return
      }

      await setActive({ session: result.createdSessionId })
      toast.success("Successfully logged in!")
      navigate({ to: "/chat", replace: true })
    } catch (err: unknown) {
      toast.error(clerkErrorMessage(err, "Failed to log in"))
    } finally {
      setLoading(false)
    }
  }

  if (isSignedIn) {
    const userEmail = clerkUser?.primaryEmailAddress?.emailAddress || "your active account"
    return (
      <AuthLayout>
        <div className="flex flex-col gap-6 text-center py-4">
          <div className="h-12 w-12 rounded-xl bg-amber-200 border-2 border-[#27272A] shadow-[2.5px_2.5px_0px_#27272A] flex items-center justify-center text-[#27272A] mx-auto">
            <User className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-extrabold text-[#27272A]">Already Signed In</h1>
            <p className="text-xs text-[#52525B]">
              You are currently logged in as <strong className="text-[#27272A]">{userEmail}</strong>.
            </p>
          </div>

          <div className="grid gap-3 pt-2">
            <Button
              type="button"
              onClick={() => navigate({ to: "/chat" })}
              className="neubrutal-btn-primary w-full h-11 text-xs gap-2"
            >
              Continue to Chat Terminal <ArrowRight className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                setLoading(true)
                await logout()
              }}
              disabled={loading}
              className="neubrutal-btn w-full h-11 text-xs gap-2 bg-white text-[#27272A]"
            >
              <LogOut className="h-4 w-4" /> Sign Out to Switch Account
            </Button>
          </div>
        </div>
      </AuthLayout>
    )
  }



  return (
    <AuthLayout>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-6"
        >
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-2xl font-bold">Login to your account</h1>
          </div>

          {isSignedIn && (
            <div className="p-3 rounded-lg bg-amber-100 border border-[#27272A] text-xs font-medium text-[#27272A] flex items-center justify-between">
              <span>You are currently signed in.</span>
              <button
                type="button"
                onClick={() => signOut?.()}
                className="font-bold underline text-blue-600 hover:text-blue-800 ml-2 cursor-pointer"
              >
                Sign Out First
              </button>
            </div>
          )}


          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      data-testid="email-input"
                      placeholder="user@example.com"
                      type="email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center">
                    <FormLabel>Password</FormLabel>
                    <RouterLink
                      to="/recover-password"
                      className="ml-auto text-sm underline-offset-4 hover:underline"
                    >
                      Forgot your password?
                    </RouterLink>
                  </div>
                  <FormControl>
                    <PasswordInput
                      data-testid="password-input"
                      placeholder="Password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <LoadingButton type="submit" loading={loading}>
              Log In
            </LoadingButton>
          </div>

          <div className="text-center text-sm">
            Don't have an account yet?{" "}
            <RouterLink to="/signup" className="underline underline-offset-4">
              Sign up
            </RouterLink>
          </div>
        </form>
      </Form>
    </AuthLayout>
  )
}
