"use client";
import { Cloud, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

export function ModeIndicator({ mode }: { mode: "local" | "cloud" }) {
  const isLocal = mode === "local";
  return (
    <span
      data-testid="reqlyai-mode-indicator"
      data-mode={mode}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        isLocal
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
          : "border-violet-500/30 bg-violet-500/10 text-violet-600"
      )}
    >
      {isLocal ? <Cpu className="size-3" /> : <Cloud className="size-3" />}
      {isLocal ? "Local" : "Cloud"}
    </span>
  );
}
