"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { workspaceFetch } from "@/lib/workspace-api";

function JoinWorkspaceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    token ? "idle" : "error",
  );
  const [message, setMessage] = useState<string>(
    token ? "" : "Aucun jeton d'invitation fourni dans l'URL.",
  );

  const join = async () => {
    if (!token) return;
    setStatus("loading");
    setMessage("");
    try {
      const res = await workspaceFetch(
        "/api/workspaces/invitations/accept",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        },
        "/api/workspaces/join",
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setMessage(data?.error || "Échec de la jointure au workspace.");
        return;
      }
      setStatus("done");
      setMessage(data?.message || "Vous avez rejoint le workspace.");
      setTimeout(() => router.push("/workspaces"), 1200);
    } catch {
      setStatus("error");
      setMessage("Impossible de contacter le serveur de synchronisation.");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="size-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Rejoindre un workspace</h1>

          {status === "error" && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{message}</span>
            </div>
          )}

          {status === "idle" && (
            <p className="text-sm text-muted-foreground">
              Vous avez été invité à rejoindre un workspace. Cliquez pour confirmer.
            </p>
          )}

          {status === "done" && <p className="text-sm text-success">{message}</p>}

          {status === "loading" && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Jointure en cours…
            </p>
          )}

          {status !== "done" && (
            <Button onClick={join} disabled={!token || status === "loading"} className="w-full">
              {status === "loading" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Rejoindre le workspace
            </Button>
          )}

          <Button
            variant="ghost"
            onClick={() => router.push("/workspaces")}
            className="text-xs text-muted-foreground"
          >
            Retour aux workspaces
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

export default function JoinWorkspacePage() {
  return (
    <Suspense fallback={null}>
      <JoinWorkspaceInner />
    </Suspense>
  );
}
