"use client"

import { useAnimations } from "@/hooks/use-animations"

export function AnimationsToggle() {
  const { enabled, toggle } = useAnimations()
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h3 className="text-sm font-medium">Animations</h3>
        <p className="text-xs text-muted-foreground">
          Désactive les transitions de l'interface. Recommandé pour l'accessibilité.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={toggle}
        className={`relative inline-flex h-[31px] w-[51px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
          enabled ? "bg-[#3B82F6]" : "bg-gray-300"
        }`}
      >
        <span
          className={`pointer-events-none inline-block size-[27px] transform rounded-full bg-white shadow ring-0 transition duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            enabled ? "translate-x-[20px]" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  )
}
