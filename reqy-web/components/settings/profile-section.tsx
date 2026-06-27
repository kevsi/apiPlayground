"use client"

import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import type { AuthUser } from "@/hooks/use-auth"

interface ProfileSectionProps {
  user: AuthUser
}

const PROVIDER_LABELS: Record<AuthUser["provider"], string> = {
  local: "Email",
  google: "Google",
  github: "GitHub",
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("")
}

export function ProfileSection({ user }: ProfileSectionProps) {
  const { toast } = useToast()
  const [name, setName] = useState(user.name)
  const [avatarSeed, setAvatarSeed] = useState(user.email.split("@")[0])
  const [oldPwd, setOldPwd] = useState("")
  const [newPwd, setNewPwd] = useState("")
  const [confirmPwd, setConfirmPwd] = useState("")
  const [deleteConfirm, setDeleteConfirm] = useState("")
  const [twoFA, setTwoFA] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [changingPwd, setChangingPwd] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function avatarUrl(seed: string): string {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed || "user")}`
  }

  function randomSeed() {
    return Math.random().toString(36).slice(2, 10)
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault()
    setSavingProfile(true)
    try {
      // V1: no backend for profile update — UI only
      await new Promise((r) => setTimeout(r, 400))
      toast({ title: "Profil mis à jour", description: "Vos modifications ont été enregistrées." })
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    if (newPwd !== confirmPwd) {
      toast({ title: "Erreur", description: "Les mots de passe ne correspondent pas", variant: "destructive" })
      return
    }
    if (newPwd.length < 8) {
      toast({ title: "Erreur", description: "Le mot de passe doit faire au moins 8 caractères", variant: "destructive" })
      return
    }
    setChangingPwd(true)
    try {
      // V1: no backend for password update — UI only
      await new Promise((r) => setTimeout(r, 400))
      toast({ title: "Mot de passe modifié", description: "Votre mot de passe a été changé." })
      setOldPwd("")
      setNewPwd("")
      setConfirmPwd("")
    } finally {
      setChangingPwd(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      // V1: real deletion out of scope — shows confirmation
      await new Promise((r) => setTimeout(r, 400))
      toast({
        title: "Fonctionnalité à venir",
        description:
          "La suppression de compte sera bientôt disponible. Contactez le support pour supprimer votre compte.",
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Read-only overview */}
      <Card>
        <CardHeader>
          <CardTitle>Aperçu du compte</CardTitle>
          <CardDescription>Vos informations de connexion.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-start gap-4">
          <Avatar className="size-16">
            <AvatarImage src={avatarUrl(user.email.split("@")[0])} alt={user.name} />
            <AvatarFallback>{initials(user.name) || "?"}</AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-base font-medium">{user.name}</p>
              <Badge variant="secondary">{PROVIDER_LABELS[user.provider]}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <p className="text-xs text-muted-foreground">
              Membre depuis — donnée bientôt disponible
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Edit profile */}
      <Card>
        <CardHeader>
          <CardTitle>Modifier mes informations</CardTitle>
          <CardDescription>Mettez à jour votre nom et votre avatar.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Nom complet</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-avatar">Avatar (seed DiceBear)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="profile-avatar"
                  value={avatarSeed}
                  onChange={(e) => setAvatarSeed(e.target.value)}
                  placeholder="ex: nurul, alex42…"
                />
                <Button type="button" variant="outline" onClick={() => setAvatarSeed(randomSeed())}>
                  🎲 Régénérer
                </Button>
                <Avatar className="size-10">
                  <AvatarImage src={avatarUrl(avatarSeed)} alt="aperçu" />
                  <AvatarFallback>?</AvatarFallback>
                </Avatar>
              </div>
            </div>
            <Button type="submit" disabled={savingProfile}>
              {savingProfile ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader>
          <CardTitle>Changer mon mot de passe</CardTitle>
          <CardDescription>Choisissez un mot de passe d'au moins 8 caractères.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="old-pwd">Mot de passe actuel</Label>
              <Input
                id="old-pwd"
                type="password"
                autoComplete="current-password"
                value={oldPwd}
                onChange={(e) => setOldPwd(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pwd">Nouveau mot de passe</Label>
              <Input
                id="new-pwd"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-pwd">Confirmer</Label>
              <Input
                id="confirm-pwd"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={changingPwd}>
              {changingPwd ? "Changement…" : "Changer le mot de passe"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle>Sécurité</CardTitle>
          <CardDescription>Options de protection de votre compte.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="2fa">Authentification à deux facteurs</Label>
            <p className="text-xs text-muted-foreground">
              Activez un code à 6 chiffres en plus de votre mot de passe.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Bientôt disponible</Badge>
            <Switch id="2fa" checked={twoFA} onCheckedChange={setTwoFA} disabled aria-readonly />
          </div>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive">Zone dangereuse</CardTitle>
          <CardDescription>Actions irréversibles sur votre compte.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Supprimer mon compte</p>
            <p className="text-xs text-muted-foreground">
              Cette action est irréversible. Toutes vos données seront supprimées définitivement.
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Supprimer</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer définitivement votre compte ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Tapez <span className="font-mono font-semibold">SUPPRIMER</span> ci-dessous pour
                  confirmer. Cette action ne peut pas être annulée.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="SUPPRIMER"
                aria-label="Confirmation de suppression"
              />
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeleteConfirm("")}>
                  Annuler
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleteConfirm !== "SUPPRIMER" || deleting}
                  onClick={(e) => {
                    e.preventDefault()
                    void handleDelete()
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? "Suppression…" : "Supprimer définitivement"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  )
}
