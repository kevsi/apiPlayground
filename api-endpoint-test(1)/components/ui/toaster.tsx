'use client'

import { useToast } from '@/hooks/use-toast'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export function Toaster() {
  const { toasts, dismiss } = useToast()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 0)
    return () => window.clearTimeout(t)
  }, [])

  if (!mounted) return null

  return createPortal(
    <div className="fixed bottom-6 right-6 z-[100] flex max-h-[80vh] w-full max-w-xs flex-col gap-3">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={t.onClick}
          className={cn(
            'pointer-events-auto relative flex w-full items-start justify-between gap-3 overflow-hidden rounded-lg border p-4 pr-3 shadow-2xl transition-all duration-300',
            t.variant === 'destructive'
              ? 'border-destructive bg-destructive text-destructive-foreground'
              : 'border bg-background text-foreground',
            t.onClick && 'cursor-pointer'
          )}
        >
          <div className="flex-1 min-w-0">
            {t.title && <div className="text-sm font-semibold">{t.title}</div>}
            {t.description && <div className="text-sm opacity-90 mt-0.5">{t.description}</div>}
          </div>
          <button
            onClick={() => dismiss(t.id)}
            className="shrink-0 rounded-md p-1 text-foreground/50 hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>,
    document.body
  )
}
