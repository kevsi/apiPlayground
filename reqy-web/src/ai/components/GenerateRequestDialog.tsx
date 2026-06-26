"use client";

/**
 * Phase 6.5 — Generate Request Dialog
 *
 * Modal that lets the user describe a request in natural language,
 * previews the heuristic-parsed request, and emits the parsed object
 * via onApply. Also exposes the LLM prompt template so users can
 * copy it to their favorite LLM if they want richer results.
 */
import { useMemo, useState } from "react";
import { Sparkles, Clipboard, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseRequestDescription, type ParsedRequest } from "@/src/ai/cloud-engine/heuristic-parser";
import { buildNaturalLanguagePrompt } from "@/src/ai/cloud-engine/generate";

export interface GenerateRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (parsed: ParsedRequest) => void;
}

export function GenerateRequestDialog({
  open,
  onOpenChange,
  onApply,
}: GenerateRequestDialogProps) {
  const [description, setDescription] = useState("");
  const [copied, setCopied] = useState(false);

  const parsed = useMemo(() => {
    if (!description.trim()) return null;
    return parseRequestDescription(description);
  }, [description]);

  const prompt = useMemo(() => {
    if (!description.trim()) return "";
    return buildNaturalLanguagePrompt(description, {});
  }, [description]);

  function handleCopyPrompt() {
    if (!prompt) return;
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  function handleApply() {
    if (!parsed) return;
    onApply(parsed);
    setDescription("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="size-4 text-primary" />
            Generate Request
          </DialogTitle>
          <DialogDescription>
            Décris ta requête en français ou en anglais. Un aperçu heuristique est calculé en
            temps réel. Tu peux aussi copier le prompt LLM pour une génération plus riche.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex : POST https://api.example.com/users avec Authorization: Bearer abc et body { name: Alice }"
            rows={4}
            className="resize-none text-sm font-mono"
            data-testid="generate-description"
          />

          {parsed && (
            <div
              className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-xs font-mono"
              data-testid="generate-preview"
            >
              <div>
                <span className="text-muted-foreground">Method: </span>
                <span className="font-semibold text-primary">{parsed.method}</span>
              </div>
              <div>
                <span className="text-muted-foreground">URL: </span>
                <span className="font-semibold">{parsed.url || "(non détectée)"}</span>
              </div>
              {parsed.headers.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Headers:</span>
                  <ul className="ml-4 mt-1 space-y-1">
                    {parsed.headers.map((h, i) => (
                      <li key={i}>
                        <span className="text-foreground/80">{h.key}</span>
                        <span className="text-muted-foreground">: </span>
                        <span>{h.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {parsed.body && (
                <div>
                  <span className="text-muted-foreground">Body:</span>
                  <pre className="ml-0 mt-1 max-h-32 overflow-auto rounded bg-background/60 p-2 text-[11px]">
                    {parsed.body}
                  </pre>
                </div>
              )}
              {parsed.headers.length === 0 && !parsed.body && (
                <div className="text-muted-foreground italic">
                  Aucun header ou body détecté. Affine la description (mentionne &ldquo;avec
                  header&rdquo; ou &ldquo;avec body&rdquo;).
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyPrompt}
            disabled={!prompt}
            data-testid="generate-copy-prompt"
          >
            <Clipboard className="size-3.5 mr-1" />
            {copied ? "Copié !" : "Copier le prompt LLM"}
          </Button>
          <div className="flex-1" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Annuler
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleApply}
            disabled={!parsed || !parsed.url}
            data-testid="generate-apply"
          >
            <Sparkles className="size-3.5 mr-1" />
            Appliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
