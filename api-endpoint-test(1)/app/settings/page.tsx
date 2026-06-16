"use client"

import { useEffect, useState } from "react"
import { ApiHeader } from "@/components/api-header"
import { ApiSidebar } from "@/components/api-sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Bell, Loader2, Sparkles } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useRequestStore } from "@/hooks/use-request-store"
import { AIProvider, loadAIProvider, loadApiKey, saveAIProvider, saveApiKey, loadOllamaConfig, saveOllamaConfig, loadAiBaseUrl, saveAiBaseUrl, loadAiModel, saveAiModel } from "@/hooks/use-projects-store"
import { useSidebar } from "@/contexts/sidebar-context"
import { ImportExportModal } from "@/components/import-export-modal"
import { toast } from '@/hooks/use-toast'

const AI_PROVIDERS: Array<{ value: AIProvider; label: string }> = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "gemini", label: "Gemini" },
  { value: "ollama", label: "Ollama" },
]

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
  const [activeSection, setActiveSection] = useState<"profile" | "ai" | "notifications" | "sync" | "integrations" | "account">(() => {
    if (typeof window !== 'undefined') {
      const h = window.location.hash?.replace("#", "");
      if (h === "profile" || h === "ai" || h === "notifications" || h === "sync" || h === "integrations" || h === "account") return h;
    }
    return "profile";
  })

  // Sync active section with URL hash so sections are linkable and navigable
  useEffect(() => {
    const onHashChange = () => {
      const h = window.location.hash?.replace("#", "") as
        | "profile"
        | "ai"
        | "notifications"
        | "sync"
        | "account"
        | ""
      if (h) setActiveSection(h || "profile")
    }

    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  useEffect(() => {
    try {
      if (activeSection) window.history.replaceState(null, "", `#${activeSection}`)
    } catch {
      // intentionally empty
    }
  }, [activeSection])



  useEffect(() => {
    const timer = saveStatus ? window.setTimeout(() => setSaveStatus(null), 3000) : undefined
    return () => {
      if (timer) window.clearTimeout(timer)
    }
  }, [saveStatus])



  const handleProviderChange = (value: AIProvider) => {
    setProvider(value)
    setApiKey(loadApiKey(value))
    setAiBaseUrl(loadAiBaseUrl(value))
    setAiModel(loadAiModel(value))

    if (value === "ollama") {
      const ollamaConfig = loadOllamaConfig()
      setOllamaHost(ollamaConfig.host || "127.0.0.1")
      setOllamaPort(ollamaConfig.port?.toString() || "11434")
      setOllamaModel(ollamaConfig.model || "llama2")
    }
  }

  const handleSaveAIConfig = () => {
    saveAIProvider(provider)
    saveApiKey(provider, apiKey)
    saveAiBaseUrl(provider, aiBaseUrl)
    saveAiModel(provider, aiModel)
    saveOllamaConfig({
      host: ollamaHost || "127.0.0.1",
      port: Number(ollamaPort) || 11434,
      model: ollamaModel || "llama2",
    })

    const savedConfig = loadOllamaConfig()
    setOllamaHost(savedConfig.host || "127.0.0.1")
    setOllamaPort(savedConfig.port?.toString() || "11434")
    setOllamaModel(savedConfig.model || "llama2")

    setSaveStatus(`Configuration enregistrée pour ${provider.toUpperCase()}`)
  }

  const connectGithub = () => {
    setGithubConnecting(true)
    setGithubStatus("loading")
    setGithubConnectDialogOpen(true)

    const githubWindow = window.open("/api/github-auth", "_blank", "noopener,noreferrer")
    if (!githubWindow) {
      window.location.href = "/api/github-auth"
    }
  }

  const disconnectGithub = async () => {
    try {
      await fetch("/api/github-auth/logout", { method: "POST" })
      setGithubStatus("disconnected")
      setGithubUser(null)
      setSaveStatus("Déconnexion GitHub enregistrée")
    } catch {
      setSaveStatus("Impossible de déconnecter GitHub")
    }
  }

  const fetchGithubStatus = async () => {
    try {
      const response = await fetch("/api/github-auth/status")
      if (!response.ok) throw new Error("Échec de la vérification GitHub")
      const data = await response.json()
      if (data.connected) {
        setGithubStatus("connected")
        setGithubUser(data.user || null)
        setGithubConnecting(false)
        setGithubConnectDialogOpen(false)
      } else {
        setGithubStatus("disconnected")
        setGithubUser(null)
      }
    } catch {
      setGithubStatus("error")
      setGithubUser(null)
    }
  }

  const fetchAuthStatus = async () => {
    try {
      const response = await fetch("/api/auth/status")
      if (!response.ok) throw new Error("Échec de la vérification de l'authentification")
      const data = await response.json()
      if (data.connected) {
        setAuthStatus("connected")
        setAuthUser(data.user || null)
      } else {
        setAuthStatus("disconnected")
        setAuthUser(null)
      }
    } catch {
      setAuthStatus("error")
      setAuthUser(null)
    } finally {
      setAuthConnecting(false)
    }
  }

  const handleAuthErrorFromQuery = () => {
    try {
      const params = new URLSearchParams(window.location.search)
      const authErrorParam = params.get("auth_error")
      if (authErrorParam) {
        setAuthError(authErrorParam)
        toast({ title: "Erreur d'authentification", description: authErrorParam, variant: "destructive" })
        params.delete("auth_error")
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`)
      }
    } catch {
      // ignore invalid URL state
    }
  }

  const connectGoogle = () => {
    setAuthConnecting(true)
    setAuthStatus("loading")
    const googleWindow = window.open("/api/auth/google", "_blank", "noopener,noreferrer")
    if (!googleWindow) {
      window.location.href = "/api/auth/google"
    }
  }

  const connectGithubAuth = () => {
    setAuthConnecting(true)
    setAuthStatus("loading")
    const githubWindow = window.open("/api/auth/github", "_blank", "noopener,noreferrer")
    if (!githubWindow) {
      window.location.href = "/api/auth/github"
    }
  }

  const signupWithEmail = async () => {
    setAuthConnecting(true)
    setAuthError(null)

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail.trim(), password: authPassword }),
      })
      const data = await response.json()
      if (!response.ok) {
        setAuthStatus("error")
        setAuthError(data.message || "Impossible de créer un compte")
        toast({ title: "Erreur", description: data.message || "Impossible de créer un compte", variant: "destructive" })
        return
      }

      if (data.connected) {
        setAuthStatus("connected")
        setAuthUser(data.user)
        setAuthEmail("")
        setAuthPassword("")
        toast({ title: "Compte créé", description: `Bienvenue ${data.user.name}` })
      } else {
        setAuthStatus("disconnected")
        setAuthError(data.message)
        toast({ title: "Inscription requise", description: data.message, variant: "default" })
      }
    } catch {
      setAuthStatus("error")
      setAuthError("Impossible de créer un compte")
      toast({ title: "Erreur", description: "Impossible de créer un compte", variant: "destructive" })
    } finally {
      setAuthConnecting(false)
    }
  }

  const loginWithEmail = async () => {
    setAuthConnecting(true)
    setAuthError(null)

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail.trim(), password: authPassword }),
      })
      const data = await response.json()
      if (!response.ok) {
        setAuthStatus("error")
        setAuthError(data.message || "Impossible de se connecter")
        toast({ title: "Erreur", description: data.message || "Impossible de se connecter", variant: "destructive" })
        return
      }

      setAuthStatus("connected")
      setAuthUser(data.user)
      setAuthEmail("")
      setAuthPassword("")
      toast({ title: "Connecté", description: `Bienvenue ${data.user.name}` })
    } catch {
      setAuthStatus("error")
      setAuthError("Impossible de se connecter")
      toast({ title: "Erreur", description: "Impossible de se connecter", variant: "destructive" })
    } finally {
      setAuthConnecting(false)
    }
  }

  const logoutAuth = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
      setAuthStatus("disconnected")
      setAuthUser(null)
      toast({ title: "Déconnecté", description: "Vous êtes maintenant déconnecté." })
    } catch {
      toast({ title: "Erreur", description: "Impossible de se déconnecter", variant: "destructive" })
    }
  }

  const fetchPostmanStatus = async () => {
    try {
      const response = await fetch("/api/postman-auth")
      if (!response.ok) throw new Error("Échec de la vérification Postman")
      const data = await response.json()
      if (data.connected) {
        setPostmanStatus("connected")
        setPostmanUser(data.user || null)
      } else {
        setPostmanStatus("disconnected")
        setPostmanUser(null)
      }
    } catch {
      setPostmanStatus("error")
      setPostmanUser(null)
    }
  }

  useEffect(() => {
    const statusTimeout = window.setTimeout(() => {
      void Promise.all([fetchGithubStatus(), fetchPostmanStatus(), fetchAuthStatus()])
      handleAuthErrorFromQuery()
    }, 0)

    return () => window.clearTimeout(statusTimeout)
  }, [])

  useEffect(() => {
    const onFocus = () => {
      fetchGithubStatus()
      fetchAuthStatus()
    }

    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [])

  // Postman handlers
  const connectPostman = async () => {
    if (!postmanApiKey.trim()) {
      toast({
        title: "Clé API requise",
        description: "Veuillez saisir votre clé API Postman pour vous connecter.",
        variant: "destructive",
      })
      return
    }

    setPostmanStatus("loading")
    setPostmanConnecting(true)

    try {
      const response = await fetch("/api/postman-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: postmanApiKey.trim() }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        setPostmanStatus("error")
        toast({
          title: "Erreur",
          description:
            error.message || "Clé API Postman invalide",
          variant: "destructive",
        })
        return
      }

      const data = await response.json()
      setPostmanStatus("connected")
      setPostmanUser(data.user)
      toast({
        title: "Postman connecté",
        description: `Bienvenue ${data.user?.name || "utilisateur"}!`,
      })
    } catch {
      setPostmanStatus("error")
      toast({
        title: "Erreur",
        description: "Impossible de se connecter à Postman",
        variant: "destructive",
      })
    } finally {
      setPostmanConnecting(false)
    }
  }

  const disconnectPostman = async () => {
    try {
      await fetch("/api/postman-auth/logout", { method: "POST" })
      setPostmanStatus("disconnected")
      setPostmanUser(null)
      setPostmanApiKey("")
      toast({
        title: "Postman déconnecté",
        description: "Votre connexion a été supprimée",
      })
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de déconnecter Postman",
        variant: "destructive",
      })
    }
  }

  // Push/toast notification settings
  const [pushEnabled, setPushEnabled] = useState<boolean>(
    (typeof window !== 'undefined' && localStorage.getItem("probe_push_enabled") === "true")
  )
  const [notifyEvents, setNotifyEvents] = useState<Record<string, boolean>>(() => {
    try {
      if (typeof window === 'undefined') {
        return {
          requestComplete: true,
          collectionComplete: true,
          aiResponse: true,
          aiError: true,
          importExport: true,
        }
      }
      const raw = localStorage.getItem("probe_push_events")
      return raw ? JSON.parse(raw) : {
        requestComplete: true,
        collectionComplete: true,
        aiResponse: true,
        aiError: true,
        importExport: true,
      }
    } catch {
      return {
        requestComplete: true,
        collectionComplete: true,
        aiResponse: true,
        aiError: true,
        importExport: true,
      }
    }
  })

  const togglePushEnabled = async (val?: boolean) => {
    const next = typeof val === "boolean" ? val : !pushEnabled
    
    // If enabling notifications, request permission from the browser
    if (next) {
      try {
        await requestSystemNotificationPermission()
      } catch {
        // Permission request failed, don't enable
        toast({
          title: "Erreur",
          description: "Impossible de demander la permission de notification.",
          variant: "destructive"
        })
        return
      }
    }
    
    setPushEnabled(next)
    try {
      localStorage.setItem("probe_push_enabled", next ? "true" : "false")
    } catch {
      // intentionally empty
    }
  }

  const toggleNotifyEvent = (key: string) => {
    const next = { ...notifyEvents, [key]: !notifyEvents[key] }
    setNotifyEvents(next)
    try {
      localStorage.setItem("probe_push_events", JSON.stringify(next))
    } catch {
      // intentionally empty
    }
  }

  const handleTestPush = () => {
    try {
      toast({ title: "Test de notification (toast)", meta: { event: "importExport" } } as unknown as Parameters<typeof toast>[0])
    } catch {
      // intentionally empty
    }
  }

  // --- User profile / simple account features ---
  const [email, setEmail] = useState<string>(
    (typeof window !== 'undefined' && localStorage.getItem("probe_user_email")) || ""
  )
  const [twoFactorEnabled, setTwoFactorEnabled] = useState<boolean>(
    (typeof window !== 'undefined' && localStorage.getItem("probe_two_factor_enabled") === "true") || false
  )

  const saveUserSettings = () => {
    try {
      localStorage.setItem("probe_user_email", email || "")
      localStorage.setItem("probe_two_factor_enabled", twoFactorEnabled ? "true" : "false")
      setSaveStatus("Paramètres utilisateur enregistrés")
      setTimeout(() => setSaveStatus(null), 2500)
    } catch {
      // intentionally empty
    }
  }

  const handleToggle2FA = () => {
    setTwoFactorEnabled((v) => !v)
  }

  const handleDeactivateAccount = () => {
    if (window.confirm("Confirmer la désactivation du compte ?")) {
      setSaveStatus("Compte désactivé (simulation)")
    }
  }

  const handleDeleteAccount = () => {
    if (window.confirm("Supprimer définitivement le compte ? Cette action est irréversible.")) {
      setSaveStatus("Compte supprimé (simulation)")
    }
  }

  return (
    <div className="flex h-screen bg-background bg-dot-pattern">
      <ApiSidebar activePage="settings" collapsed={isCollapsed} onCollapse={toggleSidebar} />

      <div
        className={cn(
          "flex flex-1 flex-col min-h-0 overflow-hidden transition-[margin] duration-200 ease-out",
          isCollapsed ? "ml-[60px]" : "ml-64",
          "max-[916px]:ml-[60px]"
        )}
      >
        <ApiHeader />

        <div className="flex-1 min-h-0 overflow-y-auto space-y-6 p-6">
          {/* ── Page header ───────────────────────────────────────── */}
          <div className="rounded-3xl border border-border bg-card p-6">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Paramètres</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                  Configuration de l'application
                </h1>
                <p className="max-w-2xl pt-2 text-sm text-muted-foreground">
                  Gérez l'assistant IA, les notifications et la synchronisation d'équipe.
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 md:mt-0">
                <Button variant="secondary" onClick={handleSaveAIConfig}>
                  Enregistrer les paramètres
                </Button>
                <Button variant="ghost" onClick={() => window.location.reload()}>
                  Recharger
                </Button>
              </div>
            </div>
            {saveStatus ? (
              <div className="mt-4 rounded-xl bg-emerald-100 px-4 py-3 text-sm text-emerald-900">
                {saveStatus}
              </div>
            ) : null}
          </div>

          <div className="flex gap-6">
            <aside className="w-56 shrink-0 rounded-2xl border border-border bg-card p-4">
              <nav className="flex flex-col gap-2">
                <button
                  className={cn("w-full text-left p-2 rounded-md", activeSection === "profile" ? "bg-primary/10 font-semibold" : "hover:bg-muted")}
                  onClick={() => setActiveSection("profile")}
                >
                  Profil & Sécurité
                </button>
                <button
                  className={cn("w-full text-left p-2 rounded-md", activeSection === "ai" ? "bg-primary/10 font-semibold" : "hover:bg-muted")}
                  onClick={() => setActiveSection("ai")}
                >
                  Assistant IA
                </button>
                <button
                  className={cn("w-full text-left p-2 rounded-md", activeSection === "notifications" ? "bg-primary/10 font-semibold" : "hover:bg-muted")}
                  onClick={() => setActiveSection("notifications")}
                >
                  Notifications
                </button>
                <button
                  className={cn("w-full text-left p-2 rounded-md", activeSection === "sync" ? "bg-primary/10 font-semibold" : "hover:bg-muted")}
                  onClick={() => setActiveSection("sync")}
                >
                  Import / Export
                </button>
                <button
                  className={cn("w-full text-left p-2 rounded-md", activeSection === "integrations" ? "bg-primary/10 font-semibold" : "hover:bg-muted")}
                  onClick={() => setActiveSection("integrations")}
                >
                  Outils connectés
                </button>
                <button
                  className={cn("w-full text-left p-2 rounded-md text-destructive", activeSection === "account" ? "bg-destructive/10 font-semibold" : "hover:bg-muted")}
                  onClick={() => setActiveSection("account")}
                >
                  Actions du compte
                </button>
              </nav>
            </aside>

            <div className="flex-1 space-y-6">
              {/* Profile & Security */}
              {activeSection === "profile" ? (
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
                    <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Non renseigné" />
                    <p className="mt-2 text-xs text-muted-foreground">L'email associé au compte (local).</p>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl bg-muted p-4">
                    <div>
                      <p className="text-sm">Vérification en deux étapes</p>
                      <p className="text-xs text-muted-foreground mt-1">Renforce la sécurité du compte.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm">{twoFactorEnabled ? "Activée" : "Désactivée"}</span>
                      <Button variant={twoFactorEnabled ? "secondary" : "outline"} onClick={handleToggle2FA}>
                        {twoFactorEnabled ? "Désactiver" : "Activer"}
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button onClick={saveUserSettings}>Enregistrer profil</Button>
                    <span className="text-sm text-muted-foreground">Paramètres personnels</span>
                  </div>
                </div>
                </section>
              ) : null}

              {/* Assistant IA */}
              {activeSection === "ai" ? (
                <section className="rounded-3xl border border-border bg-card p-6">
                <div className="mb-4 flex items-center gap-3 text-foreground">
                  <Sparkles className="size-5 text-primary" />
                  <div>
                    <h2 className="text-lg font-semibold">Assistant IA</h2>
                    <p className="text-sm text-muted-foreground">Sélectionnez votre fournisseur et stockez la clé API localement.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">Fournisseur IA</label>
                    <Select value={provider} onValueChange={(value) => handleProviderChange(value as AIProvider)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choisir un fournisseur" />
                      </SelectTrigger>
                      <SelectContent>
                        {AI_PROVIDERS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">Clé API</label>
                    <Input
                      type="password"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder="Entrez votre clé API"
                      disabled={provider === "ollama"}
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {provider === "ollama"
                        ? "Ollama est exécuté localement et ne nécessite pas de clé API."
                        : "La clé est conservée dans le stockage local du navigateur et uniquement utilisée par l'assistant IA."}
                    </p>
                  </div>

                  {provider !== "ollama" ? (
                    <>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-foreground">Modèle</label>
                        <Input
                          value={aiModel}
                          onChange={(event) => setAiModel(event.target.value)}
                          placeholder="gpt-4o / qwen3-coder-80b"
                        />
                        <p className="mt-2 text-xs text-muted-foreground">
                          Laissez vide pour utiliser le modèle par défaut. Pour g0i.ai, utilisez <code>qwen3-coder-80b</code>.
                        </p>
                      </div>

                      {provider === "openai" ? (
                        <div>
                          <label className="mb-2 block text-sm font-medium text-foreground">Base URL OpenAI compatible</label>
                          <Input
                            value={aiBaseUrl}
                            onChange={(event) => setAiBaseUrl(event.target.value)}
                            placeholder="https://api.openai.com/v1"
                          />
                          <p className="mt-2 text-xs text-muted-foreground">
                            Pour un endpoint OpenAI compatible comme g0i.ai, entrez l'URL de base et le modèle approprié.
                          </p>
                        </div>
                      ) : null}

                      {provider === "openai" ? (
                        <div className="rounded-2xl border border-slate-200 bg-muted p-4">
                          <p className="text-sm font-semibold">Quick Start OpenAI compatible</p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Exemple de configuration pour g0i.ai.
                          </p>
                          <ul className="mt-3 space-y-1 text-xs text-muted-foreground list-disc list-inside">
                            <li>Fournisseur IA : <strong>OpenAI</strong></li>
                            <li>Base URL : <strong>https://api.g0i.ai/v1</strong></li>
                            <li>Clé API : votre clé g0i.ai</li>
                            <li>Modèle : <strong>qwen3-coder-80b</strong></li>
                          </ul>
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm">Autoriser l'IA à appliquer automatiquement les changements</p>
                      <p className="text-xs text-muted-foreground">Lorsque activé, les actions IA marquées <em>autoApply: true</em> pourront être appliquées automatiquement.</p>
                    </div>
                    <Switch checked={!!aiAutoApply} onCheckedChange={(v) => {
                      const want = Boolean(v)
                      if (want) {
                        try {
                          const confirmed = localStorage.getItem('probe_ai_autorun_confirmed') === 'true'
                          if (!confirmed) {
                            setShowAiConfirm(true)
                            return
                          }
                        } catch {
                          // ignore
                        }
                      }
                      setAiAutoApply?.(want)
                    }} />

                    <Dialog open={showAiConfirm} onOpenChange={(open) => setShowAiConfirm(open)}>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Confirmer l'exécution automatique par l'IA</DialogTitle>
                          <DialogDescription>Autoriser l'IA à appliquer et exécuter des actions automatiquement peut envoyer des requêtes réseau depuis votre interface. Assurez-vous de comprendre les risques et de n'activer cette option que si vous faites confiance à vos prompts.</DialogDescription>
                        </DialogHeader>
                        <div className="mt-4 flex justify-end gap-2">
                          <Button variant="ghost" onClick={() => setShowAiConfirm(false)}>Annuler</Button>
                          <Button onClick={() => {
                            try { localStorage.setItem('probe_ai_autorun_confirmed', 'true') } catch { /* ignore */ }
                            setAiAutoApply?.(true)
                            setShowAiConfirm(false)
                          }}>Confirmer et activer</Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>

                  {provider === "ollama" ? (
                    <div className="space-y-4 rounded-2xl border border-slate-200 bg-muted p-4">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-foreground">Host</label>
                        <Input value={ollamaHost} onChange={(event) => setOllamaHost(event.target.value)} placeholder="127.0.0.1" />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-foreground">Port</label>
                        <Input value={ollamaPort} onChange={(event) => setOllamaPort(event.target.value)} placeholder="11434" />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-foreground">Modèle Ollama</label>
                        <Input value={ollamaModel} onChange={(event) => setOllamaModel(event.target.value)} placeholder="llama2" />
                        <p className="mt-2 text-xs text-muted-foreground">Modèle local Ollama installé sur votre machine. Par exemple : <code>llama2</code> ou <code>phi:latest</code>.</p>
                      </div>
                      <p className="text-xs text-muted-foreground">Configure le port local et le modèle Ollama à utiliser pour les appels IA.</p>
                    </div>
                  ) : null}

                  <div className="flex items-center gap-3">
                    <Button onClick={handleSaveAIConfig}>Sauvegarder</Button>
                    <span className="text-sm text-muted-foreground">Dernière configuration : {provider.toUpperCase()}</span>
                  </div>
                </div>
                </section>
              ) : null}

              {/* Notifications */}
              {activeSection === "notifications" ? (
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
                    <Switch checked={pushEnabled} onCheckedChange={() => togglePushEnabled()} />
                  </div>

                  <div className="rounded-2xl bg-muted p-4">
                    <p className="text-sm font-medium">Événements déclenchant des toasts</p>
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm">Requête terminée</p>
                          <p className="text-xs text-muted-foreground">Affiche un toast quand une requête se termine.</p>
                        </div>
                        <Checkbox checked={notifyEvents.requestComplete} onCheckedChange={() => toggleNotifyEvent('requestComplete')} />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm">Exécution de collection terminée</p>
                          <p className="text-xs text-muted-foreground">Toast à la fin d'une exécution de collection.</p>
                        </div>
                        <Checkbox checked={notifyEvents.collectionComplete} onCheckedChange={() => toggleNotifyEvent('collectionComplete')} />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm">Réponse IA reçue</p>
                          <p className="text-xs text-muted-foreground">Toast quand l'assistant IA renvoie une réponse.</p>
                        </div>
                        <Checkbox checked={notifyEvents.aiResponse} onCheckedChange={() => toggleNotifyEvent('aiResponse')} />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm">Erreur IA</p>
                          <p className="text-xs text-muted-foreground">Toast pour les erreurs renvoyées par le proxy IA.</p>
                        </div>
                        <Checkbox checked={notifyEvents.aiError} onCheckedChange={() => toggleNotifyEvent('aiError')} />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm">Import / Export terminé</p>
                          <p className="text-xs text-muted-foreground">Toast après import/export des collections.</p>
                        </div>
                        <Checkbox checked={notifyEvents.importExport} onCheckedChange={() => toggleNotifyEvent('importExport')} />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button variant="secondary" onClick={handleTestPush}>Tester un toast</Button>
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
              ) : null}

              {/* Sync / Import Export */}
              {activeSection === "sync" ? (
                <section className="rounded-3xl border border-border bg-card p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                        <svg className="size-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                        </svg>
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-foreground">Sync d'équipe</h2>
                        <p className="mt-0.5 text-sm text-muted-foreground">Exportez et importez vos collections et environnements.</p>
                      </div>
                    </div>
                    <Button id="open-sync-modal-btn" onClick={() => setSyncModalOpen(true)} className="shrink-0 flex items-center gap-2">
                      Import / Export
                    </Button>
                  </div>
                </section>
              ) : null}

              {/* Connected tools */}
              {activeSection === "integrations" ? (
                <section className="rounded-3xl border border-border bg-card p-6 space-y-6">
                  <div className="mb-4 flex items-center gap-3 text-foreground">
                    <div className="size-5 rounded-2xl bg-primary/10 p-2 text-primary">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z" />
                        <path d="M8 12h8" />
                        <path d="M12 8v8" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">Outils connectés</h2>
                      <p className="text-sm text-muted-foreground">Configurez vos intégrations externes. GitHub et Postman sont pris en charge.</p>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-border p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <img src="/github.png" alt="GitHub" className="h-10 w-10 rounded-full bg-white p-1" />
                        <div>
                          <p className="text-sm font-semibold">GitHub</p>
                          <p className="text-xs text-muted-foreground mt-1">Connectez-vous à GitHub pour éviter les limites de taux anonymes et importer des repos sans saisir de token.</p>
                        </div>
                      </div>
                      <div className={cn("rounded-full px-3 py-1 text-xs font-semibold", githubStatus === "connected" ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700")}>
                        {githubStatus === "connected" ? "Connecté" : githubStatus === "loading" ? "Vérification..." : githubStatus === "error" ? "Erreur" : "Non connecté"}
                      </div>
                    </div>

                    <div className="mt-6 space-y-4">
                      <div>
                        {githubStatus === "connected" && githubUser ? (
                          <div className="flex items-center gap-3">
                            {githubUser.avatar_url ? (
                              <img src={githubUser.avatar_url} alt="Avatar GitHub" className="h-10 w-10 rounded-full" />
                            ) : null}
                            <div>
                              <p className="text-sm font-semibold">{githubUser.login}</p>
                              {githubUser.name ? <p className="text-xs text-muted-foreground">{githubUser.name}</p> : null}
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Aucune connexion GitHub active. Utilisez l’authentification GitHub pour éviter les limites de taux.</p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button onClick={connectGithub} disabled={githubStatus === "connected" || githubConnecting}>
                          {githubConnecting ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="size-4 animate-spin" />
                              Connexion GitHub…
                            </span>
                          ) : (
                            "Se connecter avec GitHub"
                          )}
                        </Button>
                        <Button variant="secondary" onClick={disconnectGithub} disabled={githubStatus !== "connected"}>Déconnecter</Button>
                        {githubStatus === "connected" ? (
                          <span className="text-sm text-muted-foreground">GitHub est lié et utilisé pour l’import.</span>
                        ) : githubStatus === "error" ? (
                          <span className="text-sm text-destructive">Impossible de vérifier votre connexion GitHub.</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Aucune connexion GitHub active.</span>
                        )}
                      </div>
                      {githubConnecting ? (
                        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 flex items-center gap-2">
                          <Loader2 className="size-4 animate-spin text-slate-500" />
                          <span>Connexion GitHub en cours. Vérifiez la fenêtre GitHub ouverte, puis revenez ici.</span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Postman Integration */}
                  <div className="rounded-3xl border border-border p-5 mt-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-3">
                          <img src="/postman.png" alt="Postman" className="h-10 w-10 rounded-full bg-white p-1" />
                          <div>
                            <p className="text-sm font-semibold">Postman</p>
                            <p className="text-xs text-muted-foreground mt-1">Connectez-vous à Postman pour importer/exporter vos collections au format standard de l'industrie.</p>
                          </div>
                        </div>
                      </div>
                      <div className={cn("rounded-full px-3 py-1 text-xs font-semibold", postmanStatus === "connected" ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700")}>
                        {postmanStatus === "connected" ? "Connecté" : postmanStatus === "loading" ? "Vérification..." : postmanStatus === "error" ? "Erreur" : "Non connecté"}
                      </div>
                    </div>

                    <div className="mt-6 space-y-4">
                      <div>
                        {postmanStatus === "connected" && postmanUser ? (
                          <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                              <img src="/postman.png" alt="Postman" className="h-10 w-10 rounded-full bg-white p-1" />
                            <div>
                              <p className="text-sm font-semibold text-emerald-900">{postmanUser.name || "Utilisateur Postman"}</p>
                              <p className="text-xs text-emerald-700">{postmanUser.email || "Connecté"}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Aucune connexion Postman active. Connectez-vous pour accéder à vos collections.</p>
                        )}
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Clé API Postman</label>
                          <Input
                            type="password"
                            value={postmanApiKey}
                            onChange={(event) => setPostmanApiKey(event.target.value)}
                            placeholder="Entrez votre clé API Postman"
                            disabled={postmanStatus === "connected"}
                          />
                          <p className="text-xs text-muted-foreground">
                            Récupérez votre clé Postman depuis
                            <span className="font-semibold"> https://web.postman.co/settings/me/api-keys</span>.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button onClick={connectPostman} disabled={postmanStatus === "connected" || postmanConnecting}>
                            {postmanConnecting ? (
                              <span className="inline-flex items-center gap-2">
                                <Loader2 className="size-4 animate-spin" />
                                Connexion…
                              </span>
                            ) : (
                              "Se connecter avec Postman"
                            )}
                          </Button>
                          <Button variant="secondary" onClick={disconnectPostman} disabled={postmanStatus !== "connected"}>Déconnecter</Button>
                        </div>
                        {postmanConnecting ? (
                          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 flex items-center gap-2">
                            <Loader2 className="size-4 animate-spin text-slate-500" />
                            <span>Vérification de la clé Postman en cours…</span>
                          </div>
                        ) : null}
                      </div>

                      {postmanStatus === "connected" ? (
                        <span className="text-sm text-muted-foreground">Postman est lié. Vous pouvez importer/exporter depuis l'interface collections.</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Connectez-vous pour activer l'intégration Postman.</span>
                      )}
                    </div>
                  </div>
                </section>
              ) : null}

              {/* Account actions */}
              {activeSection === "account" ? (
                <section className="rounded-3xl border border-border bg-card p-6 space-y-6">
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold">Actions du compte</h2>
                    <p className="text-sm text-muted-foreground">Gérez votre compte et votre connexion à l’application.</p>
                  </div>

                  <div className="rounded-3xl border border-border p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold">Connexion</p>
                        <p className="text-xs text-muted-foreground mt-1">Connectez-vous avec Google ou avec un email et un mot de passe.</p>
                      </div>
                      <div className={cn("rounded-full px-3 py-1 text-xs font-semibold", authStatus === "connected" ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700")}>
                        {authStatus === "connected" ? "Connecté" : authStatus === "loading" ? "Vérification..." : authStatus === "error" ? "Erreur" : "Non connecté"}
                      </div>
                    </div>

                    <div className="mt-6 space-y-4">
                      {authStatus === "connected" && authUser ? (
                        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-full bg-emerald-200 grid place-items-center text-emerald-900 font-semibold">
                              {authUser.name?.slice(0, 1).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-semibold">{authUser.name}</p>
                              <p className="text-xs text-muted-foreground">{authUser.email}</p>
                              <p className="text-xs text-muted-foreground">Fournisseur : {authUser.provider}</p>
                            </div>
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <Button onClick={logoutAuth}>Se déconnecter</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="space-y-3 rounded-3xl border border-border bg-muted p-4">
                            <div className="grid gap-3">
                              <label className="text-sm font-medium">Email</label>
                              <Input
                                type="email"
                                value={authEmail}
                                onChange={(event) => setAuthEmail(event.target.value)}
                                placeholder="votre@example.com"
                              />
                              <label className="text-sm font-medium">Mot de passe</label>
                              <Input
                                type="password"
                                value={authPassword}
                                onChange={(event) => setAuthPassword(event.target.value)}
                                placeholder="8 caractères minimum"
                              />
                              {authError ? <p className="text-sm text-destructive">{authError}</p> : null}
                              <div className="flex flex-wrap items-center gap-2">
                                <Button onClick={loginWithEmail} disabled={authConnecting}>
                                  {authConnecting ? (
                                    <span className="inline-flex items-center gap-2">
                                      <Loader2 className="size-4 animate-spin" />
                                      Connexion…
                                    </span>
                                  ) : (
                                    "Se connecter"
                                  )}
                                </Button>
                                <Button variant="secondary" onClick={signupWithEmail} disabled={authConnecting}>
                                  {authConnecting ? "Création de compte…" : "Créer un compte"}
                                </Button>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Button variant="secondary" onClick={connectGoogle} disabled={authConnecting}>
                                  {authConnecting ? "Connexion Google…" : "Se connecter avec Google"}
                                </Button>
                                <Button variant="secondary" onClick={connectGithubAuth} disabled={authConnecting}>
                                  {authConnecting ? "Connexion GitHub…" : "Se connecter avec GitHub"}
                                </Button>
                              </div>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">La connexion est gérée par Supabase Auth : email/password, Google et GitHub.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-2xl bg-muted p-4">
                      <div>
                        <p className="font-semibold">Désactiver mon compte</p>
                        <p className="text-xs text-muted-foreground mt-1">Le compte sera réactivé lorsque vous vous reconnecterez.</p>
                      </div>
                      <Button variant="ghost" onClick={handleDeactivateAccount}>Désactiver</Button>
                    </div>

                    <div className="flex items-center justify-between rounded-2xl bg-muted p-4">
                      <div>
                        <p className="font-semibold">Supprimer mon compte</p>
                        <p className="text-xs text-muted-foreground mt-1">Suppression permanente et irréversible.</p>
                      </div>
                      <Button variant="destructive" onClick={handleDeleteAccount}>Supprimer</Button>
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
          </div>

          
        </div>
      </div>

      <Dialog open={githubConnectDialogOpen} onOpenChange={(open) => {
        setGithubConnectDialogOpen(open)
        if (!open) {
          setGithubConnecting(false)
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connexion GitHub</DialogTitle>
            <DialogDescription>
              Une nouvelle fenêtre GitHub s'ouvre pour l'authentification. Une fois la connexion terminée, revenez ici ou laissez la page se mettre à jour automatiquement.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex items-center gap-3 text-sm text-slate-700">
            <Loader2 className="size-5 animate-spin text-primary" />
            <p>Patientez pendant la redirection vers GitHub...</p>
          </div>

          <div className="mt-6 flex justify-end">
            <Button variant="secondary" onClick={() => setGithubConnectDialogOpen(false)}>
              J'ai terminé
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ImportExportModal open={syncModalOpen} onClose={() => setSyncModalOpen(false)} />
    </div>
  )
}
