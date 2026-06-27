"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { safeRedirect } from "@/lib/redirect"

interface SignupFormProps {
  redirect?: string
}

export function SignupForm({ redirect }: SignupFormProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  async function handleSignup(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      toast({ title: "Erreur", description: "Les mots de passe ne correspondent pas", variant: "destructive" })
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: "Erreur", description: data.message || "Impossible de créer le compte", variant: "destructive" })
        return
      }
      if (data.connected) {
        toast({ title: "Compte créé", description: `Bienvenue ${data.user?.name ?? email}` })
        router.replace(safeRedirect(redirect))
      } else {
        toast({
          title: "Vérifiez votre email",
          description: data.message || "Un lien de confirmation vous a été envoyé.",
        })
        router.replace(`/login${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`)
      }
    } catch {
      toast({ title: "Erreur réseau", description: "Vérifiez votre connexion", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        Pour créer un compte avec Google ou GitHub, utilisez plutôt{" "}
        <Link href={`/login${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`} className="font-medium text-primary hover:underline">
          la page de connexion
        </Link>
        .
      </div>

      <form onSubmit={handleSignup} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirmer le mot de passe</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={loading}
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Création…" : "Créer un compte"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Déjà inscrit ?{" "}
        <Link
          href={`/login${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`}
          className="font-medium text-primary hover:underline"
        >
          Se connecter
        </Link>
      </p>
    </div>
  )
}
