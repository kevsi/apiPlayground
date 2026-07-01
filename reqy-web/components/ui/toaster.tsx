'use client'

import { useToast } from '@/hooks/use-toast'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const toastIcons = {
  default: Info,
  destructive: AlertCircle,
  success: CheckCircle,
  warning: AlertTriangle,
} as const

export function Toaster() {
  const { toasts, dismiss, remove } = useToast()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 0)
    return () => window.clearTimeout(t)
  }, [])

  if (!mounted) return null

  return createPortal(
    <div className="fixed bottom-6 right-6 z-[100] flex max-h-[80vh] w-full max-w-xs flex-col gap-3">
      {toasts.map((t, idx) => {
        const Icon = toastIcons[t.variant as keyof typeof toastIcons] ?? Info
        return (
        <div
          key={t.id}
          onClick={t.onClick}
          style={{ animationDelay: `${idx * 80}ms` }}
          className={cn(
            'pointer-events-auto gpu relative flex w-full items-start gap-3 overflow-hidden rounded-lg border p-4 pr-3 shadow-2xl animate-slide-up',
            t.variant === 'destructive'
              ? 'border-destructive bg-destructive text-destructive-foreground'
              : 'border bg-background text-foreground',
            t.onClick && 'cursor-pointer'
          )}
        >
          {/* Left accent bar */}
          <span className={cn(
            'absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg',
            t.variant === 'destructive' ? 'bg-destructive-foreground/30' : 'bg-primary/40'
          )} />

          <Icon className={cn(
            'size-5 mt-0.5 shrink-0',
            t.variant === 'destructive' ? 'text-destructive-foreground/80' : 'text-primary'
          )} />

          <div className="flex-1 min-w-0">
            {t.title && <div className="text-sm font-semibold">{t.title}</div>}
            {t.description && <div className="text-sm opacity-90 mt-0.5">{t.description}</div>}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); remove(t.id) }}
            className={cn(
              'shrink-0 rounded-md p-1 transition-all duration-200',
              t.variant === 'destructive'
                ? 'text-destructive-foreground/50 hover:text-destructive-foreground hover:bg-destructive-foreground/10'
                : 'text-foreground/30 hover:text-foreground hover:bg-accent'
            )}
          >
            <X className="size-4" />
          </button>
        </div>
      )})}
    </div>,
    document.body
  )
}
