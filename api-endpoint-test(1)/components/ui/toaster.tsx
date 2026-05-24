'use client'

import { useToast } from '@/hooks/use-toast'
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast'

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      <div className="pointer-events-none">
        {toasts.map(function ({ id, title, description, action, ...props }) {
          return (
            <div key={id} className="pointer-events-auto">
              <Toast {...props}>
                <div className="flex w-full items-start gap-3">
                  <div className="flex-1">
                    {title && <ToastTitle>{title}</ToastTitle>}
                    {description && <ToastDescription>{description}</ToastDescription>}
                  </div>
                  {action}
                </div>
                <ToastClose />
              </Toast>
            </div>
          )
        })}
      </div>
      <ToastViewport />
    </ToastProvider>
  )
}
