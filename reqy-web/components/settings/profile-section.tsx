"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

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
    <section className="rounded-3xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-3 text-foreground">
        <div className="size-5 text-primary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z"></path>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold">Sécurité</h2>
          <p className="text-sm text-muted-foreground">Informations du compte et options de sécurité.</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">Adresse email</label>
          <Input value={email} onChange={(e) => onEmailChange(e.target.value)} placeholder="Non renseigné" />
          <p className="mt-2 text-xs text-muted-foreground">L'email associé au compte (local).</p>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-muted p-4">
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

        <div className="flex items-center gap-3">
          <Button onClick={onSave}>Enregistrer profil</Button>
          <span className="text-sm text-muted-foreground">Paramètres personnels</span>
        </div>
      </div>
    </section>
  )
}
