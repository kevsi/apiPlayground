"use client"

import { useEffect, useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { Bell, Sparkles, Loader2, User, Plug, ShieldAlert, Cloud } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { ApiHeader } from "@/components/api-header"
import { ApiSidebar } from "@/components/api-sidebar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useRequestStore } from "@/hooks/use-request-store"
import { persistence } from "@/lib/persistence"
import { AIProvider, loadAIProvider, loadApiKey, saveAIProvider, saveApiKey, loadOllamaConfig, saveOllamaConfig, loadAiBaseUrl, saveAiBaseUrl, loadAiModel, saveAiModel } from "@/lib/projects-store"
import { useSidebar } from "@/contexts/sidebar-context"
import { ImportExportModal } from "@/components/import-export-modal"
import { toast } from '@/hooks/use-toast'
import { getSupabaseBrowserClient } from "@/lib/supabase-client"
import { isTauriAvailable } from "@/lib/tauri"

const ProfileSection = dynamic(() => import("@/components/settings/profile-section"), { ssr: false })
const AISection = dynamic(() => import("@/components/settings/ai-section"), { ssr: false })
const NotificationsSection = dynamic(() => import("@/components/settings/notifications-section"), { ssr: false })
const SyncSection = dynamic(() => import("@/components/settings/sync-section"), { ssr: false })
const IntegrationsSection = dynamic(() => import("@/components/settings/integrations-section"), { ssr: false })
const AccountSection = dynamic(() => import("@/components/settings/account-section"), { ssr: false })

const AI_PROVIDERS: Array<{ value: AIProvider; label: string }> = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "gemini", label: "Gemini" },
  { value: "ollama", label: "Ollama" },
  { value: "opencode-zen", label: "Opencode Zen" },
]

type SectionItem = {
  key: string
  label: string
  icon: LucideIcon
  destructive?: true
}

const SECTION_ITEMS: SectionItem[] = [
  { key: "profile", label: "Profil & Sécurité", icon: User },
  { key: "ai", label: "Assistant IA", icon: Sparkles },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "sync", label: "Import / Export", icon: Cloud },
  { key: "integrations", label: "Outils connectés", icon: Plug },
  { key: "account", label: "Actions du compte", destructive: true, icon: ShieldAlert },
]

type SectionKey = (typeof SECTION_ITEMS)[number]["key"]

export default function SettingsPage() {
  const { isCollapsed, toggleSidebar } = useSidebar()
  const { systemNotificationPermission, requestSystemNotificationPermission, notificationPreferences, setNotificationPreference, aiAutoApply, setAiAutoApply } =
    useRequestStore()
  const [showAiConfirm, setShowAiConfirm] = useState(false)
  const [provider, setProvider] = useState<AIProvider>(() => typeof window !== 'undefined' ? loadAIProvider() : "openai")
  const [apiKey, setApiKey] = useState(() => typeof window !== 'undefined' ? loadApiKey(loadAIProvider()) : "")
  const [aiBaseUrl, setAiBaseUrl] = useState(() => typeof window !== 'undefined' ? loadAiBaseUrl(loadAIProvider()) : "")
  const [aiModel, setAiModel] = useState(() => typeof window !== 'undefined' ? loadAiModel(loadAIProvider()) : "")
  const [ollamaHost, setOllamaHost] = useState(() => typeof window !== 'undefined' ? (loadOllamaConfig().host || "127.0.0.1") : "127.0.0.1")
  const [ollamaPort, setOllamaPort] = useState(() => typeof window !== 'undefined' ? (loadOllamaConfig().port?.toString() || "11434") : "11434")
  const [ollamaModel, setOllamaModel] = useState(() => typeof window !== 'undefined' ? (loadOllamaConfig().model || "llama2") : "llama2")
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [syncModalOpen, setSyncModalOpen] = useState(false)

  const [githubStatus, setGithubStatus] = useState<"loading" | "connected" | "disconnected" | "error">("loading")
  const [githubUser, setGithubUser] = useState<{ login: string; name?: string; avatar_url?: string } | null>(null)
  const [postmanStatus, setPostmanStatus] = useState<"loading" | "connected" | "disconnected" | "error">("loading")
  const [postmanUser, setPostmanUser] = useState<{ id: string; name?: string; email?: string } | null>(null)
  const [postmanApiKey, setPostmanApiKey] = useState<string>("")
  const [githubConnecting, setGithubConnecting] = useState(false)
  const [githubConnectDialogOpen, setGithubConnectDialogOpen] = useState(false)
  const [postmanConnecting, setPostmanConnecting] = useState(false)

  const [authStatus, setAuthStatus] = useState<"loading" | "connected" | "disconnected" | "error">("loading")
  const [authUser, setAuthUser] = useState<{ email: string; name: string; provider: string } | null>(null)
  const [authConnecting, setAuthConnecting] = useState(false)
  const [authEmail, setAuthEmail] = useState<string>("")
  const [authPassword, setAuthPassword] = useState<string>("")
  const [authError, setAuthError] = useState<string | null>(null)

  const [activeSection, setActiveSection] = useState<SectionKey>(() => {
    if (typeof window !== 'undefined') {
      const h = window.location.hash?.replace("#", "") as SectionKey
      if (SECTION_ITEMS.some((item) => item.key === h)) return h
    }
    return "profile"
  })

  // Push/toast notification settings
  const [pushEnabled, setPushEnabled] = useState<boolean>(
    (typeof window !== 'undefined' && persistence.getItem<string>("probe_push_enabled") === "true")
  )
  const [notifyEvents, setNotifyEvents] = useState<Record<string, boolean>>(() => {
    try {
      if (typeof window === 'undefined') {
        return { requestComplete: true, collectionComplete: true, aiResponse: true, aiError: true, importExport: true }
      }
      const raw = persistence.getItem<Record<string, boolean>>("probe_push_events")
      if (!raw) return { requestComplete: true, collectionComplete: true, aiResponse: true, aiError: true, importExport: true }
      if (typeof raw === 'string') return JSON.parse(raw)
      return raw as Record<string, boolean>
    } catch {
      return { requestComplete: true, collectionComplete: true, aiResponse: true, aiError: true, importExport: true }
    }
  })

  // Profile state
  const [email, setEmail] = useState<string>(
    (typeof window !== 'undefined' && (persistence.getItem<string>("probe_user_email") ?? "")) || ""
  )
  const [twoFactorEnabled, setTwoFactorEnabled] = useState<boolean>(
    (typeof window !== 'undefined' && persistence.getItem<string>("probe_two_factor_enabled") === "true") || false
  )

  // Sync active section with URL hash
  useEffect(() => {
    const onHashChange = () => {
      const h = window.location.hash?.replace("#", "") as SectionKey
      if (SECTION_ITEMS.some((item) => item.key === h)) setActiveSection(h)
      else setActiveSection("profile")
    }
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  useEffect(() => {
    try {
      window.history.replaceState(null, "", `#${activeSection}`)
    } catch { /* ignore */ }
  }, [activeSection])

  // Auto-dismiss save status + toast notification
  useEffect(() => {
    if (saveStatus) {
      toast({ title: "Succès", description: saveStatus })
      const timer = window.setTimeout(() => setSaveStatus(null), 3000)
      return () => window.clearTimeout(timer)
    }
  }, [saveStatus])

  // AI handlers
  const handleProviderChange = useCallback((value: AIProvider) => {
    setProvider(value)
    setApiKey(loadApiKey(value))
    setAiBaseUrl(loadAiBaseUrl(value))
    setAiModel(loadAiModel(value))
    if (value === "ollama") {
      const config = loadOllamaConfig()
      setOllamaHost(config.host || "127.0.0.1")
      setOllamaPort(config.port?.toString() || "11434")
      setOllamaModel(config.model || "llama2")
    }
  }, [])

  const handleSaveAIConfig = useCallback(() => {
    saveAIProvider(provider)
    saveApiKey(provider, apiKey)
    saveAiBaseUrl(provider, aiBaseUrl)
    saveAiModel(provider, aiModel)
    saveOllamaConfig({ host: ollamaHost || "127.0.0.1", port: Number(ollamaPort) || 11434, model: ollamaModel || "llama2" })
    const savedConfig = loadOllamaConfig()
    setOllamaHost(savedConfig.host || "127.0.0.1")
    setOllamaPort(savedConfig.port?.toString() || "11434")
    setOllamaModel(savedConfig.model || "llama2")
    setSaveStatus(`Configuration enregistrée pour ${provider.toUpperCase()}`)
  }, [provider, apiKey, aiBaseUrl, aiModel, ollamaHost, ollamaPort, ollamaModel])

  // GitHub handlers
  const connectGithub = useCallback(() => {
    setGithubConnecting(true)
    setGithubStatus("loading")
    setGithubConnectDialogOpen(true)
    const githubWindow = window.open("/api/github-auth", "_blank", "noopener,noreferrer")
    if (!githubWindow) window.location.href = "/api/github-auth"
  }, [])

  const disconnectGithub = useCallback(async () => {
    try {
      await fetch("/api/github-auth/logout", { method: "POST" })
      setGithubStatus("disconnected")
      setGithubUser(null)
      setSaveStatus("Déconnexion GitHub enregistrée")
    } catch { setSaveStatus("Impossible de déconnecter GitHub") }
  }, [])

  const fetchGithubStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/github-auth/status")
      if (!response.ok) throw new Error("Échec")
      const data = await response.json()
      if (data.connected) {
        setGithubStatus("connected")
        setGithubUser(data.user || null)
        setGithubConnecting(false)
        setGithubConnectDialogOpen(false)
      } else { setGithubStatus("disconnected"); setGithubUser(null) }
    } catch { setGithubStatus("error"); setGithubUser(null) }
  }, [])

  const fetchAuthStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/status")
      if (!response.ok) throw new Error("Échec")
      const data = await response.json()
      if (data.connected) { setAuthStatus("connected"); setAuthUser(data.user || null) }
      else { setAuthStatus("disconnected"); setAuthUser(null) }
    } catch { setAuthStatus("error"); setAuthUser(null) }
    finally { setAuthConnecting(false) }
  }, [])

  const fetchPostmanStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/postman-auth")
      if (!response.ok) throw new Error("Échec")
      const data = await response.json()
      if (data.connected) { setPostmanStatus("connected"); setPostmanUser(data.user || null) }
      else { setPostmanStatus("disconnected"); setPostmanUser(null) }
    } catch { setPostmanStatus("error"); setPostmanUser(null) }
  }, [])

  const handleAuthErrorFromQuery = useCallback(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const authErrorParam = params.get("auth_error")
      if (authErrorParam) {
        setAuthError(authErrorParam)
        toast({ title: "Erreur d'authentification", description: authErrorParam, variant: "destructive" })
        params.delete("auth_error")
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`)
      }
    } catch { /* ignore */ }
  }, [])

  // Initial status fetch
  useEffect(() => {
    const statusTimeout = window.setTimeout(() => {
      void Promise.all([fetchGithubStatus(), fetchPostmanStatus(), fetchAuthStatus()])
      handleAuthErrorFromQuery()
    }, 0)
    return () => window.clearTimeout(statusTimeout)
  }, [fetchGithubStatus, fetchPostmanStatus, fetchAuthStatus, handleAuthErrorFromQuery])

  useEffect(() => {
    const onFocus = () => {
      fetchGithubStatus()
      fetchPostmanStatus()
      fetchAuthStatus()
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [fetchGithubStatus, fetchPostmanStatus, fetchAuthStatus])

  // Postman handlers
  const connectPostman = useCallback(async () => {
    if (!postmanApiKey.trim()) {
      toast({ title: "Clé API requise", description: "Veuillez saisir votre clé API Postman.", variant: "destructive" })
      return
    }
    setPostmanStatus("loading"); setPostmanConnecting(true)
    try {
      const response = await fetch("/api/postman-auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: postmanApiKey.trim() }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        setPostmanStatus("error")
        toast({ title: "Erreur", description: err.message || "Clé API Postman invalide", variant: "destructive" })
        return
      }
      const data = await response.json()
      setPostmanStatus("connected"); setPostmanUser(data.user)
      toast({ title: "Postman connecté", description: `Bienvenue ${data.user?.name || "utilisateur"}!` })
    } catch {
      setPostmanStatus("error")
      toast({ title: "Erreur", description: "Impossible de se connecter à Postman", variant: "destructive" })
    } finally { setPostmanConnecting(false) }
  }, [postmanApiKey])

  const disconnectPostman = useCallback(async () => {
    try {
      await fetch("/api/postman-auth/logout", { method: "POST" })
      setPostmanStatus("disconnected"); setPostmanUser(null); setPostmanApiKey("")
      toast({ title: "Postman déconnecté", description: "Votre connexion a été supprimée" })
    } catch { toast({ title: "Erreur", description: "Impossible de déconnecter Postman", variant: "destructive" }) }
  }, [])

  // Auth handlers
  const connectGoogle = useCallback(async () => {
    setAuthConnecting(true); setAuthStatus("loading")
    try {
      const supabase = getSupabaseBrowserClient()
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: isTauriAvailable()
            ? `${window.location.origin}/auth/callback?source=desktop`
            : `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: true,
        },
      })
      if (oauthError || !data?.url) {
        throw oauthError || new Error("URL OAuth manquante")
      }
      if (isTauriAvailable()) {
        const { invoke } = await import("@tauri-apps/api/core")
        await invoke("open_external", { url: data.url })
      } else {
        window.location.href = data.url
      }
    } catch {
      setAuthStatus("error"); setAuthConnecting(false)
      toast({ title: "Erreur OAuth", description: "Impossible de lancer la connexion Google", variant: "destructive" })
    }
  }, [])

  const connectGithubAuth = useCallback(async () => {
    setAuthConnecting(true); setAuthStatus("loading")
    try {
      const supabase = getSupabaseBrowserClient()
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: isTauriAvailable()
            ? `${window.location.origin}/auth/callback?source=desktop`
            : `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: true,
        },
      })
      if (oauthError || !data?.url) {
        throw oauthError || new Error("URL OAuth manquante")
      }
      if (isTauriAvailable()) {
        const { invoke } = await import("@tauri-apps/api/core")
        await invoke("open_external", { url: data.url })
      } else {
        window.location.href = data.url
      }
    } catch {
      setAuthStatus("error"); setAuthConnecting(false)
      toast({ title: "Erreur OAuth", description: "Impossible de lancer la connexion GitHub", variant: "destructive" })
    }
  }, [])

  const signupWithEmail = useCallback(async () => {
    setAuthConnecting(true); setAuthError(null)
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail.trim(), password: authPassword }),
      })
      const data = await response.json()
      if (!response.ok) {
        setAuthStatus("error"); setAuthError(data.message || "Impossible de créer un compte")
        toast({ title: "Erreur", description: data.message || "Impossible de créer un compte", variant: "destructive" })
        return
      }
      if (data.connected) {
        setAuthStatus("connected"); setAuthUser(data.user); setAuthEmail(""); setAuthPassword("")
        toast({ title: "Compte créé", description: `Bienvenue ${data.user.name}` })
      } else {
        setAuthStatus("disconnected"); setAuthError(data.message)
        toast({ title: "Inscription requise", description: data.message })
      }
    } catch {
      setAuthStatus("error"); setAuthError("Impossible de créer un compte")
      toast({ title: "Erreur", description: "Impossible de créer un compte", variant: "destructive" })
    } finally { setAuthConnecting(false) }
  }, [authEmail, authPassword])

  const loginWithEmail = useCallback(async () => {
    setAuthConnecting(true); setAuthError(null)
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail.trim(), password: authPassword }),
      })
      const data = await response.json()
      if (!response.ok) {
        setAuthStatus("error"); setAuthError(data.message || "Impossible de se connecter")
        toast({ title: "Erreur", description: data.message || "Impossible de se connecter", variant: "destructive" })
        return
      }
      setAuthStatus("connected"); setAuthUser(data.user); setAuthEmail(""); setAuthPassword("")
      toast({ title: "Connecté", description: `Bienvenue ${data.user.name}` })
    } catch {
      setAuthStatus("error"); setAuthError("Impossible de se connecter")
      toast({ title: "Erreur", description: "Impossible de se connecter", variant: "destructive" })
    } finally { setAuthConnecting(false) }
  }, [authEmail, authPassword])

  const logoutAuth = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
      setAuthStatus("disconnected"); setAuthUser(null)
      toast({ title: "Déconnecté", description: "Vous êtes maintenant déconnecté." })
    } catch { toast({ title: "Erreur", description: "Impossible de se déconnecter", variant: "destructive" }) }
  }, [])

  // Notification handlers
  const togglePushEnabled = useCallback(async () => {
    const next = !pushEnabled
    if (next) {
      try { await requestSystemNotificationPermission() }
      catch {
        toast({ title: "Erreur", description: "Impossible de demander la permission.", variant: "destructive" })
        return
      }
    }
    setPushEnabled(next)
    try { void persistence.setItem("probe_push_enabled", next ? "true" : "false") } catch { /* ignore */ }
  }, [pushEnabled, requestSystemNotificationPermission])

  const toggleNotifyEvent = useCallback((key: string) => {
    const next = { ...notifyEvents, [key]: !notifyEvents[key] }
    setNotifyEvents(next)
    try { void persistence.setItem("probe_push_events", next) } catch { /* ignore */ }
  }, [notifyEvents])

  const handleTestPush = useCallback(() => {
    try { toast({ title: "Test de notification (toast)", meta: { event: "importExport" } } as unknown as Parameters<typeof toast>[0]) } catch { /* ignore */ }
  }, [])

  // Profile handlers
  const saveUserSettings = useCallback(() => {
    try {
      void persistence.setItem("probe_user_email", email || "")
      void persistence.setItem("probe_two_factor_enabled", twoFactorEnabled ? "true" : "false")
      setSaveStatus("Paramètres utilisateur enregistrés")
    } catch { /* ignore */ }
  }, [email, twoFactorEnabled])

  const handleToggle2FA = useCallback(() => setTwoFactorEnabled((v) => !v), [])

  const handleDeactivateAccount = useCallback(() => {
    if (window.confirm("Confirmer la désactivation du compte ?")) setSaveStatus("Compte désactivé (simulation)")
  }, [])

  const handleDeleteAccount = useCallback(() => {
    if (window.confirm("Supprimer définitivement le compte ? Cette action est irréversible.")) setSaveStatus("Compte supprimé (simulation)")
  }, [])

  return (
    <div className="flex h-screen bg-background bg-dot-pattern">
      <ApiSidebar activePage="settings" collapsed={isCollapsed} onCollapse={toggleSidebar} />

      <div className={cn("flex flex-1 flex-col min-h-0 overflow-hidden transition-[margin] duration-200 ease-out", isCollapsed ? "ml-[60px]" : "ml-64", "max-[916px]:ml-[60px]")}>
        <ApiHeader />

        <div className="flex-1 min-h-0 overflow-y-auto space-y-6 p-6">
          <div className="flex gap-6">
            {/* Navigation sidebar */}
            <aside className="w-56 shrink-0 rounded-2xl border border-border bg-card p-4">
              <nav className="flex flex-col gap-1">
                {SECTION_ITEMS.map(({ key, label, destructive, icon: Icon }) => {
                  const isActive = activeSection === key
                  return (
                    <button
                      key={key}
                      onClick={() => setActiveSection(key)}
                      className={cn(
                        "relative flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-all duration-150",
                        isActive
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-foreground hover:bg-muted",
                        destructive && !isActive && "text-destructive"
                      )}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-primary" />
                      )}
                      <Icon className="size-4 shrink-0" />
                      <span>{label}</span>
                    </button>
                  )
                })}
              </nav>
            </aside>

            {/* Section content */}
            <div className="flex-1 space-y-6">
              {activeSection === "profile" ? (
                <ProfileSection
                  email={email}
                  twoFactorEnabled={twoFactorEnabled}
                  onEmailChange={setEmail}
                  onSave={saveUserSettings}
                  onToggle2FA={handleToggle2FA}
                />
              ) : null}
              {activeSection === "ai" ? (
                <AISection
                  provider={provider} apiKey={apiKey} aiModel={aiModel} aiBaseUrl={aiBaseUrl}
                  ollamaHost={ollamaHost} ollamaPort={ollamaPort} ollamaModel={ollamaModel}
                  aiAutoApply={aiAutoApply} showAiConfirm={showAiConfirm} aiProviders={AI_PROVIDERS}
                  onProviderChange={handleProviderChange} onSaveConfig={handleSaveAIConfig}
                  setApiKey={setApiKey} setAiModel={setAiModel} setAiBaseUrl={setAiBaseUrl}
                  setOllamaHost={setOllamaHost} setOllamaPort={setOllamaPort} setOllamaModel={setOllamaModel}
                  setAiAutoApply={setAiAutoApply} setShowAiConfirm={setShowAiConfirm}
                />
              ) : null}
              {activeSection === "notifications" ? (
                <NotificationsSection
                  pushEnabled={pushEnabled} notifyEvents={notifyEvents}
                  notificationPreferences={notificationPreferences}
                  systemNotificationPermission={systemNotificationPermission}
                  onTogglePush={togglePushEnabled} onToggleEvent={toggleNotifyEvent}
                  onTestPush={handleTestPush} setNotificationPreference={setNotificationPreference}
                />
              ) : null}
              {activeSection === "sync" ? (
                <SyncSection onOpenSyncModal={() => setSyncModalOpen(true)} />
              ) : null}
              {activeSection === "integrations" ? (
                <IntegrationsSection
                  githubStatus={githubStatus} githubUser={githubUser} githubConnecting={githubConnecting}
                  postmanStatus={postmanStatus} postmanUser={postmanUser}
                  postmanApiKey={postmanApiKey} postmanConnecting={postmanConnecting}
                  onConnectGithub={connectGithub} onDisconnectGithub={disconnectGithub}
                  setPostmanApiKey={setPostmanApiKey}
                  onConnectPostman={connectPostman}
                  onDisconnectPostman={disconnectPostman}
                />
              ) : null}
              {activeSection === "account" ? (
                <AccountSection
                  authStatus={authStatus} authUser={authUser}
                  authEmail={authEmail} authPassword={authPassword}
                  authError={authError} authConnecting={authConnecting}
                  onEmailChange={setAuthEmail} onPasswordChange={setAuthPassword}
                  onLogin={loginWithEmail} onSignup={signupWithEmail}
                  onConnectGoogle={connectGoogle} onConnectGithub={connectGithubAuth}
                  onLogout={logoutAuth} onDeactivate={handleDeactivateAccount} onDelete={handleDeleteAccount}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={githubConnectDialogOpen} onOpenChange={(open) => { setGithubConnectDialogOpen(open); if (!open) setGithubConnecting(false) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connexion GitHub</DialogTitle>
            <DialogDescription>Une nouvelle fenêtre GitHub s'ouvre pour l'authentification.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex items-center gap-3 text-sm text-slate-700">
            <Loader2 className="size-5 animate-spin text-primary" />
            <p>Patientez pendant la redirection vers GitHub...</p>
          </div>
          <div className="mt-6 flex justify-end">
            <Button variant="secondary" onClick={() => setGithubConnectDialogOpen(false)}>J'ai terminé</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ImportExportModal open={syncModalOpen} onClose={() => setSyncModalOpen(false)} />
    </div>
  )
}
