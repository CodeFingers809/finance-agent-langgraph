import { useSignIn } from "@clerk/react/legacy"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  createFileRoute,
  Link as RouterLink,
  useNavigate,
} from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

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

// Redirect-away-when-signed-in is handled in the component via Clerk's real
// state; a cookie check here can be stale after sign-out and would trap the
// user in a /login <-> /chat loop.
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
  const { isLoaded: authLoaded, isSignedIn } = useAuth()
  const { isLoaded, signIn, setActive } = useSignIn()
  const [loading, setLoading] = useState(false)

  // Already signed in -> leave. Based on Clerk's real state, not a cookie.
  useEffect(() => {
    if (authLoaded && isSignedIn) {
      navigate({ to: "/chat", replace: true })
    }
  }, [authLoaded, isSignedIn, navigate])

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
      // Clerk is the only identity provider. Errors must propagate: silently
      // continuing to /chat without a session produced an endless 401 loop.
      const result = await signIn.create({
        identifier: data.username,
        password: data.password,
      })

      if (result.status !== "complete") {
        // Password sign-in completes in one step for this instance (device
        // trust is disabled). Anything else means the Clerk instance config
        // changed and needs a matching UI step built here.
        toast.error(SIGN_IN_STEP_MESSAGES[result.status ?? ""] ?? `Sign-in needs an extra step (${result.status}).`)
        return
      }

      await setActive({ session: result.createdSessionId })
      toast.success("Successfully logged in!")
      // Full reload so the Clerk token bridge initializes with the new session.
      window.location.href = "/chat"
    } catch (err: unknown) {
      toast.error(clerkErrorMessage(err, "Failed to log in"))
    } finally {
      setLoading(false)
    }
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
