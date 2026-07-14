"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Play, Square, RefreshCw, Wand2, CheckCircle2 } from "lucide-react";
import { useRequestStore } from "@/hooks/use-request-store";
import {
  isTauriAvailable,
  listCapturedSessions,
  getCapturedSession,
  startCaptureProxy,
  stopCaptureProxy,
  type CapturedSummary,
  type CapturedRequest,
} from "@/lib/tauri";
import { generateCollectionFromCapture, type ExportBundle } from "@/lib/capture-to-test/generate";
import type { Assertion } from "@/lib/test-runner/types";

function describeAssertion(a: Assertion): string {
  switch (a.type) {
    case "status": {
      if (typeof a.expected === "number") return `status == ${a.expected}`;
      if (a.expected && typeof a.expected === "object" && "in" in a.expected) {
        return `status ∈ [${a.expected.in.join(", ")}]`;
      }
      if (a.expected && typeof a.expected === "object" && "not" in a.expected) {
        return `status != ${a.expected.not}`;
      }
      return "status assertion";
    }
    case "jsonPath":
      return `body.${a.path} ${a.operator}`;
    case "schema":
      return "response matches inferred JSON schema";
    case "responseTime":
      return `response time ${a.operator} ${a.valueMs}ms`;
    default:
      return "assertion";
  }
}

export default function CapturePage() {
  const { addCollection, addRequestToCollection } = useRequestStore();

  const [port, setPort] = useState<number>(8080);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState<CapturedSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<ExportBundle | null>(null);
  const [collectionName, setCollectionName] = useState<string>("");
  const [savedName, setSavedName] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    try {
      const list = await listCapturedSessions();
      setSessions(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const startProxy = async () => {
    setError(null);
    setBusy(true);
    try {
      await startCaptureProxy(port);
      setRunning(true);
      setSessions([]);
      setBundle(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const stopProxy = async () => {
    setError(null);
    setBusy(true);
    try {
      await stopCaptureProxy();
      setRunning(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    setError(null);
    setSavedName(null);
    setBusy(true);
    try {
      const list = await listCapturedSessions();
      setSessions(list);
      const detailed: CapturedRequest[] = [];
      for (const s of list) {
        const full = await getCapturedSession(s.id);
        if (full) detailed.push(full);
      }
      if (detailed.length === 0) {
        setError("Aucune requête capturée. Démarrez la capture puis envoyez du trafic.");
        return;
      }
      const generated = generateCollectionFromCapture(detailed);
      setBundle(generated);
      setCollectionName(generated.collections[0].name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!bundle) return;
    const col = bundle.collections[0];
    const newId = addCollection({
      name: collectionName.trim() || col.name,
      color: col.color,
      icon: col.icon,
      description: col.description,
    });
    for (const req of col.requests) {
      addRequestToCollection(newId, req);
    }
    setSavedName(collectionName.trim() || col.name);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Capture de trafic</h1>
        <p className="text-muted-foreground">
          Interceptez le trafic HTTP via le proxy de capture Reqly, puis générez une collection de
          requêtes testables à partir des appels capturés.
        </p>
      </header>

      {!isTauriAvailable() && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700">
          La capture nécessite l&apos;application de bureau Reqly (Tauri). La génération et
          l&apos;enregistrement de collection restent disponibles.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Session de capture</CardTitle>
          <CardDescription>
            Le proxy écoute sur <code>127.0.0.1:port</code> et relaie vers l&apos;hôte cible
            (en-tête <code>Host</code>).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-medium" htmlFor="capture-port">
              Port
            </label>
            <input
              id="capture-port"
              type="number"
              value={port}
              min={1024}
              max={65535}
              disabled={running}
              onChange={(e) => setPort(Number(e.target.value))}
              className="w-28 rounded-md border border-input bg-background px-2 py-1 text-sm"
            />
            {!running ? (
              <Button onClick={startProxy} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                Démarrer la capture
              </Button>
            ) : (
              <Button variant="destructive" onClick={stopProxy} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" />}
                Arrêter la capture
              </Button>
            )}
            <Button variant="outline" onClick={refresh} disabled={busy}>
              <RefreshCw className="size-4" />
              Rafraîchir
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{sessions.length} requête(s) capturée(s).</p>
        </CardContent>
      </Card>

      <div>
        <Button onClick={generate} disabled={busy || sessions.length === 0}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
          Générer une collection depuis cette capture
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {bundle && (
        <Card>
          <CardHeader>
            <CardTitle>Aperçu de la collection</CardTitle>
            <CardDescription>
              Modifiez le nom puis enregistrez la collection dans votre espace de travail.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium" htmlFor="collection-name">
                Nom
              </label>
              <input
                id="collection-name"
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
                className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm"
              />
            </div>

            <ul className="space-y-3">
              {bundle.collections[0].requests.map((req, i) => (
                <li key={i} className="rounded-md border p-3 text-sm">
                  <div className="font-medium">
                    {req.method} {req.url}
                  </div>
                  <ul className="mt-1 list-inside list-disc text-muted-foreground">
                    {req.runnerAssertions.map((a, j) => (
                      <li key={j}>{describeAssertion(a)}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>

            <Button onClick={save} disabled={!!savedName}>
              {savedName ? <CheckCircle2 className="size-4" /> : "Enregistrer la collection"}
            </Button>
            {savedName && (
              <p className="text-sm text-success">Collection « {savedName} » enregistrée.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
