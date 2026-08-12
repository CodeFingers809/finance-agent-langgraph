import { zodResolver } from "@hookform/resolvers/zod"
import {
  createFileRoute,
  Link as RouterLink,
  useNavigate,
} from "@tanstack/react-router"


import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { useClerk } from "@clerk/react"
import { useSignUp } from "@clerk/react/legacy"
import { toast } from "sonner"
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

const formSchema = z
  .object({
    email: z.email({ message: "Invalid email address" }),
    full_name: z.string().min(1, { message: "Full Name is required" }),
    password: z
      .string()
      .min(1, { message: "Password is required" })
      .min(8, { message: "Password must be at least 8 characters" }),
    confirm_password: z
      .string()
      .min(1, { message: "Password confirmation is required" }),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "The passwords don't match",
    path: ["confirm_password"],
  })

type FormData = z.infer<typeof formSchema>

export const Route = createFileRoute("/signup")({
  component: SignUp,
  head: () => ({
    meta: [
      {
        title: "Sign Up - FastAPI Template",
      },
    ],
  }),
})

function SignUp() {
  const navigate = useNavigate()
  const { isLoaded, signUp, setActive } = useSignUp()
  const { signOut } = useClerk()
  const { isSignedIn } = useAuth()
  const [loading, setLoading] = useState(false)

  const [verifying, setVerifying] = useState(false)
  const [code, setCode] = useState("")

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigate({ to: "/chat", replace: true })
    }
  }, [isLoaded, isSignedIn, navigate])

  if (isLoaded && isSignedIn) return null


  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      email: "",
      full_name: "",
      password: "",
      confirm_password: "",
    },
  })

  const onSubmit = async (data: FormData) => {
    if (!isLoaded || loading) return
    setLoading(true)
    try {
      if (isSignedIn) {
        await signOut()
      }
      const result = await signUp.create({
        emailAddress: data.email,
        password: data.password,
      })

      if (result.status === "complete") {
        const sessionId = result.createdSessionId || signUp.createdSessionId
        if (sessionId) {
          await setActive({ session: sessionId })
        }
        toast.success("Account created successfully!")
        navigate({ to: "/chat", replace: true })
      } else {
        await signUp.prepareEmailAddressVerification({ strategy: "email_code" })
        setVerifying(true)
        toast.info("Verification code sent to your email!")
      }
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        "Sign up failed. Please try again."
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoaded || !code.trim() || loading) return
    setLoading(true)
    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: code.trim(),
      })

      if (result.status === "complete") {
        const sessionId = result.createdSessionId || signUp.createdSessionId
        if (sessionId) {
          await setActive({ session: sessionId })
        }
        toast.success("Account verified & logged in!")
        navigate({ to: "/chat", replace: true })
      } else {
        toast.error(`Verification status: ${result.status}`)
      }


    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        "Verification failed. Please check your code and try again."
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  if (verifying) {
    return (
      <AuthLayout>
        <form onSubmit={handleVerifyCode} className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-2xl font-bold">Verify your email</h1>
            <p className="text-xs text-[#52525B]">
              We sent a 6-digit verification code to your email. Enter it below to complete sign up.
            </p>
          </div>

          <div className="grid gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="code-input" className="text-xs font-bold text-[#27272A]">
                Verification Code
              </label>
              <Input
                id="code-input"
                data-testid="verification-code-input"
                placeholder="123456"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </div>

            <LoadingButton type="submit" className="w-full" loading={loading}>
              Verify Code & Sign In
            </LoadingButton>

            <button
              type="button"
              onClick={async () => {
                try {
                  await signUp?.prepareEmailAddressVerification({ strategy: "email_code" })
                  toast.success("Verification code resent!")
                } catch (e: any) {
                  toast.error("Failed to resend code.")
                }
              }}
              className="text-xs text-center text-blue-600 hover:underline font-medium cursor-pointer"
            >

              Didn't receive email? Resend code
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
            <h1 className="text-2xl font-bold">Create an account</h1>
          </div>

          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input
                      data-testid="full-name-input"
                      placeholder="User"
                      type="text"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
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
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <PasswordInput
                      data-testid="password-input"
                      placeholder="Password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirm_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl>
                    <PasswordInput
                      data-testid="confirm-password-input"
                      placeholder="Confirm Password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <LoadingButton
              type="submit"
              className="w-full"
              loading={loading}
            >
              Sign Up
            </LoadingButton>
          </div>

          <div className="text-center text-sm">
            Already have an account?{" "}
            <RouterLink to="/login" className="underline underline-offset-4">
              Log in
            </RouterLink>
          </div>
        </form>
      </Form>
    </AuthLayout>
  )
}
