"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, X, PanelRightClose, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAIEngine } from "@/hooks/use-ai-engine";
import { usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const STORAGE_WIDTH_KEY = "ai-sidebar-width";
const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 300;
const MAX_WIDTH = 600;

interface AiSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function AiSidebar({ open, onClose }: AiSidebarProps) {
  const pathname = usePathname();
  const aiEngine = useAIEngine();

  // Width state (persisted)
  const [width, setWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    const saved = localStorage.getItem(STORAGE_WIDTH_KEY);
    return saved ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Number(saved))) : DEFAULT_WIDTH;
  });

  // Resize drag state
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Message state
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>(
    [],
  );
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persist width
  useEffect(() => {
    localStorage.setItem(STORAGE_WIDTH_KEY, String(width));
  }, [width]);

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!sidebarRef.current) return;
      const rect = sidebarRef.current.getBoundingClientRect();
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, rect.right - e.clientX));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Send message
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setIsLoading(true);

    try {
      const buildContext = aiEngine.buildContext();
      const systemPrompt = `Tu es un assistant IA intégré dans une application API Playground.
La page actuelle est : ${pathname}

Contexte de l'application :
${JSON.stringify(buildContext, null, 2)}

Tu peux aider l'utilisateur à interagir avec l'application.
Réponds de manière concise et utile.`;

      const response = await aiEngine.sendMessage(text, systemPrompt, buildContext);
      setMessages((prev) => [...prev, { role: "assistant", content: response }]);
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : "Erreur lors de la communication avec l'IA";
      setError(errMsg);
      setMessages((prev) => [...prev, { role: "assistant", content: `❌ ${errMsg}` }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, pathname, aiEngine]);

  // Handle Enter to send
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  if (!open) return null;

  return (
    <>
      {/* Overlay for mobile */}
      <div className="fixed inset-0 z-30 bg-black/20 md:hidden" onClick={onClose} />

      {/* Resize handle */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10",
          "hover:bg-primary/30 hover:w-1.5",
          "transition-all duration-150",
          isResizing && "bg-primary/50 w-1.5",
        )}
        onMouseDown={handleResizeStart}
      />

      {/* Sidebar */}
      <div
        ref={sidebarRef}
        className={cn(
          "relative flex flex-col border-l border-border bg-background",
          "h-screen shrink-0",
          "transition-[width] duration-150 ease-out",
          isResizing && "transition-none",
          !open && "w-0 overflow-hidden",
        )}
        style={{ width: open ? width : 0 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 h-12 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <span className="text-sm font-semibold">Assistant IA</span>
          </div>
          <button
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Fermer"
          >
            <PanelRightClose className="size-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <Sparkles className="size-10 mb-3 text-primary/40" />
              <p className="text-sm font-medium">Assistant IA</p>
              <p className="text-xs mt-1 max-w-[240px]">
                Demande-moi d'exécuter des requêtes, gérer des collections, ou naviguer dans
                l'application.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                msg.role === "user"
                  ? "bg-primary/10 text-foreground ml-8"
                  : "bg-muted/30 text-foreground mr-8 border border-border/50",
              )}
            >
              {msg.content}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Réflexion…
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border p-3 shrink-0">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Demande à l'assistant…"
              disabled={isLoading}
              className="flex-1 text-sm"
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="shrink-0"
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/50 mt-1.5 text-center">
            L'IA n'agit que sur demande explicite
          </p>
        </div>
      </div>
    </>
  );
}
