"use client"

import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ChevronDown, LogOut, User as UserIcon } from "lucide-react"
import type { AuthUser } from "@/hooks/use-auth"

interface UserMenuProps {
  user: AuthUser
  onLogout: () => Promise<void>
}

const PROVIDER_LABELS: Record<AuthUser["provider"], string> = {
  local: "Email",
  google: "Google",
  github: "GitHub",
}

function avatarUrl(email: string): string {
  const seed = encodeURIComponent(email.split("@")[0] || "user")
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("")
}

export function UserMenu({ user, onLogout }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Menu utilisateur"
          className="group/profile flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-all duration-200 hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Avatar className="size-8 shrink-0 ring-2 ring-transparent transition-all duration-200 group-hover/profile:ring-primary/30">
            <AvatarImage src={avatarUrl(user.email)} alt={user.name} />
            <AvatarFallback>{initials(user.name) || "?"}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </div>
          <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground/60 transition-transform duration-200 group-data-[state=open]/profile:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
          <span className="text-sm font-medium">{user.name}</span>
          <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
          <span className="mt-1 inline-flex w-fit items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            {PROVIDER_LABELS[user.provider]}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings#profile" className="cursor-pointer">
            <UserIcon className="mr-2 size-4" />
            Mon profil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => { void onLogout() }}
          className="cursor-pointer text-muted-foreground focus:text-destructive"
        >
          <LogOut className="mr-2 size-4" />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
