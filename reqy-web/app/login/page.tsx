"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { LoginLayout } from "@/components/login/login-layout"
import { LoginForm } from "@/components/login/login-form"
import { useAuth } from "@/hooks/use-auth"

function LoginPageInner() {
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
    <LoginLayout title="Connectez-vous à Reqly">
      <LoginForm redirect={redirect} />
    </LoginLayout>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      }
    >
      <LoginPageInner />
    </Suspense>
  )
}
