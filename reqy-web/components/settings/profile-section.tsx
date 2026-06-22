"use client"

import { User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

interface ProfileSectionProps {
  email: string
  twoFactorEnabled: boolean
  onEmailChange: (val: string) => void
  onSave: () => void
  onToggle2FA: () => void
}

export default function ProfileSection({
  email, twoFactorEnabled, onEmailChange, onSave, onToggle2FA,
}: ProfileSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <User className="size-5 text-primary" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-base">Sécurité</CardTitle>
            <CardDescription>Informations du compte et options de sécurité.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">Adresse email</label>
          <Input value={email} onChange={(e) => onEmailChange(e.target.value)} placeholder="Non renseigné" />
          <p className="mt-2 text-xs text-muted-foreground">L'email associé au compte (local).</p>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-4">
          <div>
            <p className="text-sm">Vérification en deux étapes</p>
            <p className="text-xs text-muted-foreground mt-1">Renforce la sécurité du compte.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm">{twoFactorEnabled ? "Activée" : "Désactivée"}</span>
            <Button variant={twoFactorEnabled ? "secondary" : "outline"} onClick={onToggle2FA}>
              {twoFactorEnabled ? "Désactiver" : "Activer"}
            </Button>
          </div>
        </div>
      </CardContent>
      <CardFooter className="border-t pt-5">
        <div className="flex items-center gap-3">
          <Button onClick={onSave}>Enregistrer profil</Button>
          <span className="text-sm text-muted-foreground">Paramètres personnels</span>
        </div>
      </CardFooter>
    </Card>
  )
}