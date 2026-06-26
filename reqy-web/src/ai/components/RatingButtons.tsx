"use client";

/**
 * Phase 7.3 — Thumbs up / down rating for diagnostics
 *
 * Persists the rating via feedback-store. Displays the current rating
 * if one exists. No-op visually while the request is in-flight.
 */
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  rateDiagnostic,
  getRating,
  type Rating,
} from "@/src/ai/cloud-engine/feedback-store";

export interface RatingButtonsProps {
  diagnosticId: string;
  className?: string;
}

export function RatingButtons({ diagnosticId, className }: RatingButtonsProps) {
  const [rating, setRating] = useState<Rating | null>(null);

  useEffect(() => {
    setRating(getRating(diagnosticId));
  }, [diagnosticId]);

  function handleClick(next: Rating) {
    // Toggle: clicking the same rating clears it.
    const target = rating === next ? null : next;
    rateDiagnostic(diagnosticId, target);
    setRating(target);
  }

  return (
    <div
      className={cn("inline-flex items-center gap-1", className)}
      data-testid="rating-buttons"
      data-rating={rating ?? "none"}
    >
      <button
        type="button"
        onClick={() => handleClick("up")}
        aria-label="Diagnostic utile"
        aria-pressed={rating === "up"}
        title="Ce diagnostic m'a aidé"
        className={cn(
          "inline-flex size-6 items-center justify-center rounded transition-colors",
          rating === "up"
            ? "bg-emerald-500/20 text-emerald-600"
            : "text-muted-foreground/60 hover:bg-emerald-500/10 hover:text-emerald-600"
        )}
      >
        <ThumbsUp className="size-3" />
      </button>
      <button
        type="button"
        onClick={() => handleClick("down")}
        aria-label="Diagnostic inutile"
        aria-pressed={rating === "down"}
        title="Ce diagnostic n'est pas pertinent"
        className={cn(
          "inline-flex size-6 items-center justify-center rounded transition-colors",
          rating === "down"
            ? "bg-red-500/20 text-red-600"
            : "text-muted-foreground/60 hover:bg-red-500/10 hover:text-red-600"
        )}
      >
        <ThumbsDown className="size-3" />
      </button>
    </div>
  );
}
