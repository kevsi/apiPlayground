"use client";

import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  Play,
  Square,
  RefreshCw,
  Wand2,
  CheckCircle2,
  Trash2,
  Database,
} from "lucide-react";
import { useRequestStore } from "@/hooks/use-request-store";
import {
  isTauriAvailable,
  listCapturedSessions,
  getCapturedSession,
  startCaptureProxy,
  stopCaptureProxy,
  clearCapturedSessions,
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

/** Colour classes for an HTTP method badge. */
function methodBadgeClass(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "bg-emerald-100 text-emerald-700";
    case "POST":
      return "bg-sky-100 text-sky-700";
    case "PUT":
      return "bg-amber-100 text-amber-700";
    case "PATCH":
      return "bg-violet-100 text-violet-700";
    case "DELETE":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

/** Colour classes for an HTTP status badge. */
function statusBadgeClass(status: number | null | undefined): string {
  if (status == null) return "bg-slate-100 text-slate-500";
  if (status >= 500) return "bg-destructive/15 text-destructive";
  if (status >= 400) return "bg-warning/15 text-warning";
  if (status >= 300) return "bg-sky-100 text-sky-700";
  if (status >= 200) return "bg-success/15 text-success";
  return "bg-slate-100 text-slate-500";
}

function toSummary(c: CapturedRequest): CapturedSummary {
  return { id: c.id, method: c.method, url: c.url, timestamp: c.timestamp };
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return "";
  }
}

export default function CapturePage() {
  const { addCollection, addRequestToCollection } = useRequestStore();

  const [port, setPort] = useState<number>(8080);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState<CapturedSummary[]>([]);
  const [statusById, setStatusById] = useState<Record<string, number | null>>({});
  const [selected, setSelected] = useState<CapturedRequest | null>(null);
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
      setStatusById((prev) => {
        const next = { ...prev };
        for (const s of list) {
          if (!(s.id in next)) next[s.id] = null;
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // Auto-load persisted captures on mount so they survive a reload/restart.
  useEffect(() => {
    void refresh();
  }, []);

  // Live updates: reflect captured requests as they flow through the proxy.
  useEffect(() => {
    if (!isTauriAvailable()) return;
    let unsubs: Array<() => void> = [];
    let cancelled = false;
    Promise.all([
      listen<CapturedRequest>("captured-request", (e) => {
        const c = e.payload;
        setSessions((prev) => (prev.some((x) => x.id === c.id) ? prev : [toSummary(c), ...prev]));
        setStatusById((s) => ({ ...s, [c.id]: c.status ?? null }));
      }),
      listen<CapturedRequest>("captured-request-updated", (e) => {
        const c = e.payload;
        setStatusById((s) => ({ ...s, [c.id]: c.status ?? null }));
        setSessions((prev) =>
          prev.map((x) => (x.id === c.id ? { ...x, timestamp: c.timestamp } : x)),
        );
        setSelected((sel) => (sel && sel.id === c.id ? c : sel));
      }),
    ])
      .then((unsubFns) => {
        if (!cancelled) unsubs = unsubFns as Array<() => void>;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, []);

  const startProxy = async () => {
    setError(null);
    setBusy(true);
    try {
      await startCaptureProxy(port);
      setRunning(true);
      setSessions([]);
      setStatusById({});
      setBundle(null);
      setSelected(null);
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

  const clearAll = async () => {
    setError(null);
    setBusy(true);
    try {
      await clearCapturedSessions();
      setSessions([]);
      setStatusById({});
      setSelected(null);
      setBundle(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (id: string) => {
    setError(null);
    try {
      const full = await getCapturedSession(id);
      if (full) setSelected(full);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
        <h1 className="text-2xl font-bold tracking-tight">Capture de trafic</h1>
        <p className="text-muted-foreground">
          Interceptez le trafic HTTP via le proxy de capture Reqly, puis générez une collection de
          requêtes testables à partir des appels capturés.
        </p>
      </header>

      {!isTauriAvailable() && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
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
            <Button variant="ghost" onClick={clearAll} disabled={busy || sessions.length === 0}>
              <Trash2 className="size-4" />
              Effacer
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{sessions.length} requête(s) capturée(s).</span>
            {sessions.length > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success"
                title="Les captures sont enregistrées sur le disque et survivent au redémarrage"
              >
                <Database className="size-3" />
                Enregistré localement
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {sessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Requêtes capturées</CardTitle>
            <CardDescription>
              Cliquez une ligne pour voir le détail requête / réponse.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-md border">
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => openDetail(s.id)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span
                      data-method={s.method}
                      className={cn(
                        "inline-flex h-6 min-w-[3.5rem] items-center justify-center rounded px-2 text-xs font-semibold",
                        methodBadgeClass(s.method),
                      )}
                    >
                      {s.method}
                    </span>
                    <span className="flex-1 truncate font-mono text-xs text-foreground">
                      {s.url}
                    </span>
                    <span
                      className={cn(
                        "inline-flex h-6 items-center justify-center rounded px-2 text-xs font-semibold",
                        statusBadgeClass(statusById[s.id]),
                      )}
                    >
                      {statusById[s.id] != null ? statusById[s.id] : "…"}
                    </span>
                    <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                      {formatTime(s.timestamp)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
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

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            data-testid="capture-detail"
            className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-lg bg-background p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  data-method={selected.method}
                  className={cn(
                    "inline-flex h-6 min-w-[3.5rem] items-center justify-center rounded px-2 text-xs font-semibold",
                    methodBadgeClass(selected.method),
                  )}
                >
                  {selected.method}
                </span>
                <span className="break-all font-mono text-sm">{selected.url}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                Fermer
              </Button>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
              <span
                className={cn(
                  "inline-flex h-6 items-center justify-center rounded px-2 text-xs font-semibold",
                  statusBadgeClass(selected.status),
                )}
              >
                {selected.status != null ? `Statut ${selected.status}` : "Statut —"}
              </span>
              {selected.durationMs != null && (
                <span className="text-muted-foreground">{selected.durationMs} ms</span>
              )}
              {selected.error && (
                <span className="text-destructive">Erreur : {selected.error}</span>
              )}
            </div>

            <div className="space-y-4 text-sm">
              <section>
                <h3 className="mb-1 font-semibold">Requête</h3>
                <KeyValueList pairs={selected.headers} empty="Aucun en-tête" />
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                  {selected.body ?? "(pas de corps)"}
                </pre>
              </section>

              <section>
                <h3 className="mb-1 font-semibold">Réponse</h3>
                <KeyValueList pairs={selected.responseHeaders ?? []} empty="Aucun en-tête" />
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                  {selected.responseBody ?? "(pas de corps)"}
                </pre>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KeyValueList({ pairs, empty }: { pairs: Array<[string, string]>; empty: string }) {
  if (!pairs || pairs.length === 0) {
    return <p className="text-xs text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="divide-y rounded border text-xs">
      {pairs.map(([k, v], i) => (
        <li key={i} className="flex gap-2 px-2 py-1">
          <span className="font-medium text-muted-foreground">{k}:</span>
          <span className="break-all">{v}</span>
        </li>
      ))}
    </ul>
  );
}
