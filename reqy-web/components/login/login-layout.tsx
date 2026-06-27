"use client"

import type { ReactNode } from "react"
import { AppIcon } from "@/components/app-icon"

interface LoginLayoutProps {
  title: string
  children: ReactNode
}

export function LoginLayout({ title, children }: LoginLayoutProps) {
  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Left pane — branding */}
      <aside
        aria-hidden="true"
        className="relative hidden flex-1 flex-col justify-between overflow-hidden border-r border-border bg-gradient-to-br from-primary/15 via-primary/5 to-accent/30 p-10 lg:flex"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-sm">
            <AppIcon aria-hidden="true" className="size-6 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-semibold text-foreground">Reqly</span>
            <span className="text-xs text-muted-foreground">Pro</span>
          </div>
        </div>

        <div className="space-y-6">
          <h1 className="max-w-md text-3xl font-semibold leading-tight text-foreground">
            L'API playground nouvelle génération.
          </h1>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-center gap-3">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs text-primary">✓</span>
              Mock servers et environnements multiples
            </li>
            <li className="flex items-center gap-3">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs text-primary">✓</span>
              Assistant IA pour générer vos requêtes
            </li>
            <li className="flex items-center gap-3">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs text-primary">✓</span>
              Collections, tests automatisés et synchronisation cloud
            </li>
          </ul>
        </div>

        <p className="text-xs text-muted-foreground">
          En vous connectant, vous acceptez nos conditions d'utilisation et notre politique de confidentialité.
        </p>
      </aside>

      {/* Right pane — form */}
      <main className="flex flex-1 items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}
