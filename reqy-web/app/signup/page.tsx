"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { LoginLayout } from "@/components/login/login-layout"
import { SignupForm } from "@/components/login/signup-form"
import { useAuth } from "@/hooks/use-auth"

function SignupPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get("redirect") ?? undefined
  const { status } = useAuth()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (status === "connected") {
      router.replace(redirect ?? "/")
    } else if (status !== "loading") {
      setChecked(true)
    }
  }, [status, redirect, router])

  if (!checked && status !== "connected") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <LoginLayout title="Créer un compte Reqly">
      <SignupForm redirect={redirect} />
    </LoginLayout>
  )
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      }
    >
      <SignupPageInner />
    </Suspense>
  )
}
