import { cn } from "@/lib/utils";
import type { Severity } from "@/src/ai/types";

const SEVERITY_STYLES: Record<Severity, string> = {
  error: "bg-red-500/10 text-red-600 border-red-500/30",
  warning: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  info: "bg-blue-500/10 text-blue-600 border-blue-500/30",
};

const SEVERITY_LABELS: Record<Severity, string> = {
  error: "ERREUR",
  warning: "ATTENTION",
  info: "INFO",
};

export function DiagBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border",
        SEVERITY_STYLES[severity]
      )}
    >
      {SEVERITY_LABELS[severity]}
    </span>
  );
}
