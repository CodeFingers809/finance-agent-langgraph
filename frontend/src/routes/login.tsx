import { useSignIn } from "@clerk/react/legacy"
import { useClerk } from "@clerk/react"

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
  const { isSignedIn } = useAuth()

  const { isLoaded, signIn } = useSignIn()
  const { signOut, setActive } = useClerk()
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

  const [verifying, setVerifying] = useState(false)
  const [code, setCode] = useState("")

  const onSubmit = async (data: FormData) => {
    if (loading || !signIn) return
    setLoading(true)
    try {
      if (isSignedIn && signOut) {
        await signOut()
      }
      const result = await signIn.create({
        identifier: data.username,
        password: data.password,
      })

      if (result.status === "complete") {
        const sessionId = result.createdSessionId || signIn.createdSessionId
        if (sessionId) {
          await setActive({ session: sessionId })
        }
        toast.success("Successfully logged in!")
        navigate({ to: "/chat", replace: true })
      } else if (
        result.status === "needs_first_factor" ||
        result.status === "needs_second_factor" ||
        result.status === "needs_client_trust"
      ) {
        const emailFactor = (result.supportedFirstFactors as any[])?.find(
          (f: any) => f.strategy === "email_code"
        )
        if (emailFactor && signIn.prepareFirstFactor) {
          await signIn.prepareFirstFactor({
            strategy: "email_code",
            emailAddressId: emailFactor.emailAddressId,
          })
        }
        setVerifying(true)
        toast.info("Verification code required to authorize this device.")
      } else {
        toast.error(
          SIGN_IN_STEP_MESSAGES[result.status ?? ""] ??
            `Sign-in status: ${result.status}`
        )
      }
    } catch (err: unknown) {
      const msg = clerkErrorMessage(err, "Failed to log in")
      if (msg.toLowerCase().includes("already signed in") || msg.toLowerCase().includes("already_signed_in")) {
        const sessionId = signIn.createdSessionId
        if (sessionId) {
          await setActive({ session: sessionId })
        }
        toast.success("Successfully logged in!")
        navigate({ to: "/chat", replace: true })
        return
      }
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyFactor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!signIn || !code.trim() || loading) return
    setLoading(true)
    try {
      let result
      if (signIn.status === "needs_second_factor") {
        result = await signIn.attemptSecondFactor({
          strategy: "totp",
          code: code.trim(),
        })
      } else {
        result = await signIn.attemptFirstFactor({
          strategy: "email_code",
          code: code.trim(),
        })
      }

      if (result.status === "complete") {
        const sessionId = result.createdSessionId || signIn.createdSessionId
        if (sessionId) {
          await setActive({ session: sessionId })
        }
        toast.success("Successfully authenticated!")
        navigate({ to: "/chat", replace: true })
      } else {
        toast.error(`Verification status: ${result.status}`)
      }
    } catch (err: unknown) {
      const msg = clerkErrorMessage(err, "Verification code invalid.")
      if (msg.toLowerCase().includes("already signed in") || msg.toLowerCase().includes("already_signed_in")) {
        const sessionId = signIn.createdSessionId
        if (sessionId) {
          await setActive({ session: sessionId })
        }
        toast.success("Successfully authenticated!")
        navigate({ to: "/chat", replace: true })
        return
      }
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }


  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigate({ to: "/chat", replace: true })
    }
  }, [isLoaded, isSignedIn, navigate])

  if (isLoaded && isSignedIn) return null

  if (verifying) {
    return (
      <AuthLayout>
        <form onSubmit={handleVerifyFactor} className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-2xl font-bold">Device Verification</h1>
            <p className="text-xs text-[#52525B]">
              Enter the verification code sent to your email or authentication app.
            </p>
          </div>

          <div className="grid gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="login-code-input" className="text-xs font-bold text-[#27272A]">
                Verification Code
              </label>
              <Input
                id="login-code-input"
                placeholder="123456"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </div>

            <LoadingButton type="submit" className="w-full" loading={loading}>
              Authorize & Sign In
            </LoadingButton>

            <button
              type="button"
              onClick={() => setVerifying(false)}
              className="text-xs text-center text-[#52525B] hover:underline cursor-pointer"
            >
              Back to Password Sign In
            </button>
          </div>
        </form>
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
