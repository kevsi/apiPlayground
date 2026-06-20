"use client"

import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"

interface NotificationsSectionProps {
  pushEnabled: boolean
  notifyEvents: Record<string, boolean>
  notificationPreferences: Record<string, boolean>
  systemNotificationPermission: string | undefined
  onTogglePush: () => void
  onToggleEvent: (key: string) => void
  onTestPush: () => void
  setNotificationPreference: (key: string, value: boolean) => void
}

export default function NotificationsSection({
  pushEnabled, notifyEvents, notificationPreferences,
  systemNotificationPermission,
  onTogglePush, onToggleEvent, onTestPush,
  setNotificationPreference,
}: NotificationsSectionProps) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-3 text-foreground">
        <Bell className="size-5 text-secondary" />
        <div>
          <h2 className="text-lg font-semibold">Notifications</h2>
          <p className="text-sm text-muted-foreground">Gérez l'accès aux notifications système de votre navigateur.</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">Activer les notifications (toasts)</p>
            <p className="text-xs text-muted-foreground">Les notifications apparaîtront sous forme de toasts dans l'interface.</p>
          </div>
          <Switch checked={pushEnabled} onCheckedChange={() => onTogglePush()} />
        </div>

        <div className="rounded-2xl bg-muted p-4">
          <p className="text-sm font-medium">Événements déclenchant des toasts</p>
          <div className="mt-3 space-y-2">
            {[
              { key: 'requestComplete', label: 'Requête terminée', desc: 'Affiche un toast quand une requête se termine.' },
              { key: 'collectionComplete', label: 'Exécution de collection terminée', desc: "Toast à la fin d'une exécution de collection." },
              { key: 'aiResponse', label: 'Réponse IA reçue', desc: "Toast quand l'assistant IA renvoie une réponse." },
              { key: 'aiError', label: 'Erreur IA', desc: 'Toast pour les erreurs renvoyées par le proxy IA.' },
              { key: 'importExport', label: 'Import / Export terminé', desc: "Toast après import/export des collections." },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <p className="text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <Checkbox checked={notifyEvents[key]} onCheckedChange={() => onToggleEvent(key)} />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={onTestPush}>Tester un toast</Button>
          <span className="text-sm text-muted-foreground">Browser permission: {systemNotificationPermission ?? "unavailable"}</span>
        </div>

        <div className="rounded-2xl bg-muted p-4">
          <p className="text-sm font-medium">System notification events</p>
          <p className="text-xs text-muted-foreground mt-1 mb-3">Control which events trigger browser notifications.</p>
          <div className="space-y-2">
            {Object.keys(notificationPreferences).map((key) => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <p className="text-sm capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                </div>
                <Checkbox
                  checked={notificationPreferences[key] ?? true}
                  onCheckedChange={(checked) => setNotificationPreference(key, !!checked)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
