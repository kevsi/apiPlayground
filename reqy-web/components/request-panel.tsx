"use client";

import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Play,
  Code,
  Braces,
  Check,
  Copy,
  Loader2,
  FlaskConical,
  Terminal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { HttpMethod } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutocompleteInput, type AutocompleteGroup } from "@/components/ui/autocomplete-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

import type { BodyType, AuthType, QueryParam, Header, PathParam } from "@/lib/request-executor";
import { extractPathParamNames, syncPathParams } from "@/lib/path-params";
import { normalizeUrl as canonicalNormalizeUrl } from "@/lib/request-executor";
import type { RequestTestAssertion, AssertionType } from "@/lib/types";
import type { Assertion } from "@/lib/test-runner/types";
import { Switch } from "@/components/ui/switch";
import { AssertionEditor } from "@/components/assertion-editor";
import { ScriptEditor } from "@/components/script-editor";
import { methodBg, methodDot } from "@/lib/http-method-colors";
import { KeyValueEditor } from "@/components/key-value-editor";
import { AuthSection } from "@/components/auth-section";
import { BodyEditor } from "@/components/body-editor";
import { toast } from "@/hooks/use-toast";

interface RequestPanelProps {
  method: HttpMethod;
  url: string;
  queryParams: QueryParam[];
  pathParams: PathParam[];
  headers: Header[];
  body: string;
  bodyType: BodyType;
  authType: AuthType;
  authToken: string;
  assertions?: RequestTestAssertion[];
  runnerAssertions?: Assertion[];
  preRequestScript?: string;
  postResponseScript?: string;
  onMethodChange: (method: HttpMethod) => void;
  onUrlChange: (url: string) => void;
  onQueryParamsChange: (queryParams: QueryParam[]) => void;
  onPathParamsChange: (pathParams: PathParam[]) => void;
  onHeadersChange: (headers: Header[]) => void;
  onBodyChange: (body: string) => void;
  onBodyTypeChange: (bodyType: BodyType) => void;
  onAuthChange: (type: AuthType, token: string) => void;
  onAssertionsChange?: (assertions: RequestTestAssertion[]) => void;
  onRunnerAssertionsChange?: (assertions: Assertion[]) => void;
  onPreRequestScriptChange?: (script: string) => void;
  onPostResponseScriptChange?: (script: string) => void;
  onRunTests?: () => void;
  onSend: () => Promise<void>;
  isLoading?: boolean;
  variableNames?: string[];
  /** History URLs for autocomplete (deduplicated most recent first). */
  historyUrls?: string[];
  /** Active environment variable names (enabled keys). */
  environmentVariableNames?: string[];
  /** Recent query param key suggestions from history. */
  queryParamKeySuggestions?: AutocompleteGroup[];
  /** Recent form-data key suggestions from history. */
  formDataKeySuggestions?: AutocompleteGroup[];
}

export function RequestPanel({
  method,
  url,
  queryParams,
  pathParams = [],
  headers,
  body,
  bodyType,
  authType,
  authToken,
  assertions,
  runnerAssertions,
  preRequestScript,
  postResponseScript,
  onMethodChange,
  onUrlChange,
  onQueryParamsChange,
  onPathParamsChange,
  onHeadersChange,
  onBodyChange,
  onBodyTypeChange,
  onAuthChange,
  onAssertionsChange,
  onRunnerAssertionsChange,
  onPreRequestScriptChange,
  onPostResponseScriptChange,
  onRunTests,
  onSend,
  isLoading,
  variableNames,
  historyUrls: historyUrlsProp,
  environmentVariableNames,
  queryParamKeySuggestions,
  formDataKeySuggestions,
}: RequestPanelProps) {
  const [exportFormat, setExportFormat] = useState<"curl" | "fetch">("curl");

  const [exportCopied, setExportCopied] = useState(false);
  const [curlImportOpen, setCurlImportOpen] = useState(false);
  const [curlInput, setCurlInput] = useState("");
  const urlInputRef = useRef<HTMLInputElement>(null);

  // Sync path params when URL changes — auto-add/remove :param patterns
  // Uses a ref to track the last synced URL so we don't loop.
  const lastSyncedUrlRef = useRef(url);
  useEffect(() => {
    if (url === lastSyncedUrlRef.current) return;
    lastSyncedUrlRef.current = url;
    const synced = syncPathParams(url, pathParams);
    onPathParamsChange(synced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Auto-parse query params from the URL and merge with existing ones.
  // Preserves existing user-added params that aren't in the URL.
  const lastParsedUrlRef = useRef(url);
  const queryParamsRef = useRef(queryParams);
  queryParamsRef.current = queryParams;
  useEffect(() => {
    if (url === lastParsedUrlRef.current) return;
    lastParsedUrlRef.current = url;
    const qIndex = url.indexOf("?");
    if (qIndex === -1) return;
    const qs = url.slice(qIndex + 1).split("#")[0]; // strip hash
    if (!qs.trim()) return;

    // Parse ?key=value&... from the URL
    const urlParams = new URLSearchParams(qs);
    const current = queryParamsRef.current ?? [];
    const merged = new Map<string, QueryParam>();

    // Start with existing params (preserved if not overwritten by URL)
    for (const p of current) {
      merged.set(p.key, { ...p });
    }

    // URL params override (or add) existing ones, enabled by default
    for (const [key, value] of urlParams.entries()) {
      const existing = merged.get(key);
      if (existing && !existing.key.startsWith("__")) {
        // Update value but keep enabled/disabled state if user set it
        merged.set(key, { ...existing, value });
      } else {
        merged.set(key, { key, value, enabled: true });
      }
    }

    const mergedArr = Array.from(merged.values());

    // Only fire if something actually changed
    const currentJson = JSON.stringify(current);
    const mergedJson = JSON.stringify(mergedArr);
    if (currentJson !== mergedJson) {
      onQueryParamsChange(mergedArr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const urlAutocompleteGroups = useMemo((): AutocompleteGroup[] => {
    const groups: AutocompleteGroup[] = [];

    // Environment variables — show as {{var}}
    const envVars = environmentVariableNames?.filter(Boolean) ?? [];
    if (envVars.length > 0) {
      groups.push({
        label: "Variables",
        items: envVars.map((name) => {
          const wrapped = `{{${name}}}`;
          return {
            id: `var-${name}`,
            label: wrapped,
            value: wrapped,
          };
        }),
      });
    }

    // Variable mappings (chained variables)
    const chainVars = variableNames?.filter(Boolean) ?? [];
    if (chainVars.length > 0) {
      groups.push({
        label: "Enchaînement",
        items: chainVars.map((name) => {
          const wrapped = `{{${name}}}`;
          return {
            id: `chain-${name}`,
            label: wrapped,
            value: wrapped,
          };
        }),
      });
    }

    // URL history (deduplicated, most recent first)
    const seen = new Set<string>();
    const historyItems: AutocompleteGroup["items"] = [];
    for (const u of historyUrlsProp ?? []) {
      if (!u || seen.has(u)) continue;
      seen.add(u);
      historyItems.push({
        id: `url-${u}`,
        label: u,
        value: u,
      });
    }
    if (historyItems.length > 0) {
      groups.push({
        label: "Historique",
        items: historyItems.slice(0, 20), // cap at 20
      });
    }

    return groups;
  }, [environmentVariableNames, variableNames, historyUrlsProp]);

  // ── Autocomplete suggestions for KeyValueEditor ──────────────────────────
  const COMMON_HEADER_NAMES = [
    "Accept",
    "Accept-Encoding",
    "Accept-Language",
    "Access-Control-Allow-Origin",
    "Authorization",
    "Cache-Control",
    "Connection",
    "Content-Disposition",
    "Content-Encoding",
    "Content-Length",
    "Content-Type",
    "Cookie",
    "Cross-Origin-Resource-Policy",
    "Date",
    "ETag",
    "Expect",
    "Expires",
    "Host",
    "If-Match",
    "If-Modified-Since",
    "If-None-Match",
    "If-Range",
    "If-Unmodified-Since",
    "Last-Modified",
    "Link",
    "Location",
    "Origin",
    "Pragma",
    "Range",
    "Referer",
    "Retry-After",
    "Sec-Fetch-Dest",
    "Sec-Fetch-Mode",
    "Sec-Fetch-Site",
    "Sec-Fetch-User",
    "Sec-WebSocket-Accept",
    "Sec-WebSocket-Key",
    "Sec-WebSocket-Version",
    "Server",
    "Set-Cookie",
    "Strict-Transport-Security",
    "Transfer-Encoding",
    "Upgrade",
    "User-Agent",
    "Vary",
    "Via",
    "WWW-Authenticate",
    "X-API-Key",
    "X-CSRF-Token",
    "X-Forwarded-For",
    "X-Forwarded-Proto",
    "X-Request-ID",
    "X-Requested-With",
  ];

  const headerKeySuggestions = useMemo((): AutocompleteGroup[] => {
    return [
      {
        label: "En-têtes courants",
        items: COMMON_HEADER_NAMES.map((name) => ({
          id: `hdr-${name}`,
          label: name,
          value: name,
        })),
      },
    ];
  }, []);

  const valueVarSuggestions = useMemo((): AutocompleteGroup[] => {
    const vars = environmentVariableNames?.filter(Boolean) ?? [];
    if (vars.length === 0) return [];
    return [
      {
        label: "Variables",
        items: vars.map((name) => ({
          id: `vval-${name}`,
          label: `{{${name}}}`,
          value: `{{${name}}}`,
        })),
      },
    ];
  }, [environmentVariableNames]);

  const hasUrl = url.trim().length > 0;

  const buildFullUrl = () => {
    try {
      const finalUrl = new URL(canonicalNormalizeUrl(url));
      queryParams.forEach((param) => {
        if (param.enabled === false) return;
        if (!param.key.trim() || !param.value.trim()) return;
        finalUrl.searchParams.append(param.key.trim(), param.value.trim());
      });
      return finalUrl.toString();
    } catch {
      const queryString = queryParams
        .filter((param) => param.enabled !== false && param.key.trim() && param.value.trim())
        .map(
          (param) =>
            `${encodeURIComponent(param.key.trim())}=${encodeURIComponent(param.value.trim())}`,
        )
        .join("&");
      if (!queryString) return url;
      return url + (url.includes("?") ? "&" : "?") + queryString;
    }
  };

  const buildAuthHeaders = () => {
    const authHeaders: Array<[string, string]> = [];
    if (authType !== "none" && authToken.trim()) {
      if (authType === "bearer" || authType === "oauth2") {
        authHeaders.push(["Authorization", `Bearer ${authToken.trim()}`]);
      } else if (authType === "basic") {
        authHeaders.push(["Authorization", `Basic ${authToken.trim()}`]);
      } else if (authType === "api-key") {
        authHeaders.push(["x-api-key", authToken.trim()]);
      }
    }
    return authHeaders;
  };

  const buildRequestHeaders = () => {
    const requestHeaders: Array<[string, string]> = [...buildAuthHeaders()];
    headers.forEach((header) => {
      if (header.enabled !== false && header.key.trim() && header.value.trim()) {
        requestHeaders.push([header.key.trim(), header.value.trim()]);
      }
    });
    return requestHeaders;
  };

  const buildCurlCommand = () => {
    const finalUrl = buildFullUrl();
    const headerLines = buildRequestHeaders().map(
      ([key, value]) => `-H "${key}: ${value.replace(/"/g, '\\"')}"`,
    );
    const bodyText = body && method !== "GET" ? `--data-raw '${body.replace(/'/g, "'\\''")}'` : "";
    const parts = ["curl", `-X ${method}`, ...headerLines];
    if (bodyText) parts.push(bodyText);
    parts.push(`"${finalUrl}"`);
    return parts.join(" \\\n      ");
  };

  const buildFetchCommand = () => {
    const finalUrl = buildFullUrl();
    const headersObject = Object.fromEntries(buildRequestHeaders());
    const bodyPart = body && method !== "GET" ? `  body: ${JSON.stringify(body)},\n` : "";
    return `fetch("${finalUrl}", {
  method: "${method}",
  headers: ${JSON.stringify(headersObject, null, 2)},
${bodyPart}})
  .then((res) => res.text())
  .then((text) => console.log(text));`;
  };

  const getExportSnippet = () =>
    exportFormat === "curl" ? buildCurlCommand() : buildFetchCommand();

  const handleCopyExport = async () => {
    try {
      await navigator.clipboard.writeText(getExportSnippet());
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 2000);
    } catch {
      setExportCopied(false);
    }
  };

  return (
    <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
      {/* Request URL Section */}
      <div className="p-2 pb-1">
        {/* URL Bar */}
        <div className="flex items-center gap-1.5 rounded-lg border border-input/50 px-2.5 py-1 transition-all duration-200">
          {/* Method select */}
          <Select value={method} onValueChange={(value) => onMethodChange(value as HttpMethod)}>
            <SelectTrigger
              aria-label="HTTP method"
              data-testid="method-selector"
              className={cn(
                "shrink-0 rounded-md border-0 px-2 py-0.5 text-[10px] font-bold font-mono cursor-pointer transition-all duration-200 outline-none ring-offset-0 focus:ring-0 focus:ring-offset-0 h-auto w-auto gap-0.5 [&>svg]:size-3",
                methodBg[method],
                "text-white",
              )}
            >
              <SelectValue placeholder={method} />
            </SelectTrigger>
            <SelectContent>
              {(["GET", "POST", "PUT", "PATCH", "DELETE"] as const).map((m) => (
                <SelectItem key={m} value={m}>
                  <span className="flex items-center gap-2">
                    <span className={cn("size-1.5 rounded-full shrink-0", methodDot[m])} />
                    {m}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* URL Input with autocomplete */}
          <div className="relative flex-1">
            <AutocompleteInput
              ref={urlInputRef}
              data-testid="url-input"
              value={url}
              onChange={onUrlChange}
              placeholder="https://api.example.com/endpoint"
              className="text-xs h-7 py-0 px-2"
              suggestions={urlAutocompleteGroups}
              emptyMessage="Aucun résultat"
            />
          </div>

          {/* Paste cURL */}
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground/50 hover:text-foreground"
              onClick={() => {
                setCurlImportOpen(!curlImportOpen);
                setCurlInput("");
              }}
              title="Coller une commande cURL"
            >
              <Terminal className="size-3.5" />
            </Button>
            {curlImportOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-[420px] rounded-lg border border-border bg-popover shadow-xl animate-in fade-in-0 zoom-in-95">
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/40">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Coller une commande cURL
                  </span>
                  <button
                    onClick={() => setCurlImportOpen(false)}
                    className="rounded p-0.5 text-muted-foreground/50 hover:text-foreground transition-colors"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                <div className="p-3 space-y-2">
                  <textarea
                    value={curlInput}
                    onChange={(e) => setCurlInput(e.target.value)}
                    placeholder={`curl -X POST https://api.example.com/data \\\n  -H "Content-Type: application/json" \\\n  -d '{"key": "value"}'`}
                    className="w-full h-24 rounded-md border border-input bg-muted/20 px-3 py-2 text-xs font-mono resize-none outline-none focus:border-primary/50 transition-colors"
                    spellCheck={false}
                  />
                  <div className="flex justify-end gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setCurlImportOpen(false)}
                    >
                      Annuler
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1"
                      disabled={!curlInput.trim()}
                      onClick={async () => {
                        try {
                          const { parseCurlCommand } = await import("@/lib/curl-parser");
                          const parsed = parseCurlCommand(curlInput);
                          if (!parsed) {
                            toast({
                              title: "Impossible de parser la commande",
                              description: "Vérifiez le format de la commande cURL",
                              variant: "destructive",
                            });
                            return;
                          }
                          onMethodChange(parsed.method as HttpMethod);
                          onUrlChange(parsed.url);
                          const parsedHeaders = Object.entries(parsed.headers).map(
                            ([key, value]) => ({
                              key,
                              value,
                              enabled: true,
                            }),
                          );
                          onHeadersChange([...headers, ...parsedHeaders]);
                          if (parsed.body) {
                            onBodyChange(parsed.body);
                            onBodyTypeChange("raw");
                          }
                          if (parsed.auth)
                            onAuthChange(
                              "basic",
                              btoa(`${parsed.auth.username}:${parsed.auth.password}`),
                            );
                          setCurlImportOpen(false);
                          toast({
                            title: "cURL importé",
                            description: `${parsed.method} ${parsed.url.slice(0, 60)}…`,
                          });
                        } catch (err) {
                          toast({
                            title: "Erreur d'import",
                            description: String(err),
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      <Terminal className="size-3" />
                      Importer
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Variables dropdown */}
          {variableNames && variableNames.length > 0 && (
            <div className="relative">
              <select
                aria-label="Insert variable"
                className="h-7 rounded-md border border-input/50 bg-muted/30 px-1.5 text-[10px] font-mono text-muted-foreground cursor-pointer outline-none hover:border-muted-foreground/30 appearance-none"
                value=""
                onChange={(e) => {
                  const name = e.target.value;
                  if (name && urlInputRef.current) {
                    const input = urlInputRef.current;
                    const start = input.selectionStart ?? url.length;
                    const end = input.selectionEnd ?? url.length;
                    const newUrl = url.slice(0, start) + `{{${name}}}` + url.slice(end);
                    onUrlChange(newUrl);
                    requestAnimationFrame(() => {
                      const pos = start + name.length + 4;
                      input.setSelectionRange(pos, pos);
                      input.focus();
                    });
                  }
                  e.target.value = "";
                }}
              >
                <option value="" disabled>
                  Variables
                </option>
                {variableNames.map((n) => (
                  <option key={n} value={n}>{`{{${n}}}`}</option>
                ))}
              </select>
            </div>
          )}

          <Button
            disabled={!hasUrl || isLoading}
            data-testid="send-button"
            onClick={async () => {
              if (!hasUrl) return;
              await onSend();
            }}
            className={cn(
              "h-7 shrink-0 gap-1.5 px-2.5 text-xs font-semibold transition-all duration-200",
              methodBg[method],
              "text-white hover:opacity-85",
            )}
            title={!hasUrl ? "URL required to send" : "Send request"}
          >
            {isLoading ? (
              <Loader2 className="size-3.5 animate-spin fill-current" />
            ) : (
              <Play className="size-3.5 fill-current" />
            )}
            <span>{isLoading ? "Sending..." : "Send"}</span>
          </Button>
        </div>

        {/* Variables in URL */}
        {hasUrl && url.includes("{{") && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 animate-slide-up">
            {Array.from(url.matchAll(/\{\{\s*(\w+)\s*\}\}/g)).map((match) => {
              const varName = match[1];
              return (
                <span
                  key={varName}
                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-mono font-medium text-primary border border-primary/20"
                >
                  <Braces className="size-3" />
                  {varName}
                </span>
              );
            })}
            {url.match(/\{\{[^}]+\}\}/g)?.some((m) => !m.match(/^\{\{\s*\w+\s*\}\}$/)) && (
              <span className="text-[11px] font-medium text-warning bg-warning/10 px-2 py-0.5 rounded-md">
                Invalid variable syntax
              </span>
            )}
          </div>
        )}
        {!hasUrl && (
          <p className="mt-1 px-2.5 text-xs text-muted-foreground/70">
            Enter a valid URL to enable sending.
          </p>
        )}

        {/* Export row */}
        <div className="mt-2 flex items-center justify-end gap-1.5 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Select
              value={exportFormat}
              onValueChange={(value) => setExportFormat(value as "curl" | "fetch")}
            >
              <SelectTrigger className="h-8 w-auto gap-2 border-input bg-muted/30 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-muted-foreground/30">
                <Code className="size-3.5" />
                <SelectValue placeholder="Export" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="curl">cURL</SelectItem>
                <SelectItem value="fetch">Fetch</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={handleCopyExport}
              className={cn(
                "h-8 gap-1.5 text-xs font-medium transition-all duration-200",
                exportCopied ? "border-success/30 text-success bg-success/10" : "",
              )}
            >
              {exportCopied ? (
                <>
                  <Check className="size-3.5" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  Copy {exportFormat === "curl" ? "cURL" : "Fetch"}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Accordion — collapsed sections, expand to configure */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <Accordion type="multiple" className="space-y-1">
          {/* Path Variables - detected from :param patterns in the URL */}
          <AccordionItem value="path-vars" className="border border-border rounded-lg px-4 ">
            <AccordionTrigger className="py-3 text-xs font-semibold uppercase tracking-wider hover:no-underline [&[data-state=open]>svg]:rotate-180">
              <span className="flex items-center gap-2">
                Path Variables
                {(pathParams?.length ?? 0) > 0 && (
                  <span className="rounded-full bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] font-mono font-normal">
                    {pathParams?.length ?? 0}
                  </span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <KeyValueEditor
                pairs={pathParams ?? []}
                onChange={onPathParamsChange}
                keyPlaceholder=":param"
                valuePlaceholder="Value"
                addLabel="Add Path Variable"
                emptyLabel="No path params detected — use :id in the URL"
                showToggle
                valueSuggestions={valueVarSuggestions}
              />
            </AccordionContent>
          </AccordionItem>

          {/* Query Params */}
          <AccordionItem value="query-params" className="border border-border rounded-lg px-4 ">
            <AccordionTrigger className="py-3 text-xs font-semibold uppercase tracking-wider hover:no-underline [&[data-state=open]>svg]:rotate-180">
              <span className="flex items-center gap-2">
                Query Params
                {queryParams.length > 0 && (
                  <span className="rounded-full bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] font-mono font-normal">
                    {queryParams.length}
                  </span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <KeyValueEditor
                pairs={queryParams}
                onChange={onQueryParamsChange}
                keyPlaceholder="Key"
                valuePlaceholder="Value"
                addLabel="Add Parameter"
                emptyLabel="No parameters added yet"
                showToggle
                keySuggestions={queryParamKeySuggestions}
                valueSuggestions={valueVarSuggestions}
              />
            </AccordionContent>
          </AccordionItem>

          {/* Headers */}
          <AccordionItem value="headers" className="border border-border rounded-lg px-4 ">
            <AccordionTrigger className="py-3 text-xs font-semibold uppercase tracking-wider hover:no-underline [&[data-state=open]>svg]:rotate-180">
              <span className="flex items-center gap-2">
                Headers
                {headers.length > 0 && (
                  <span className="rounded-full bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] font-mono font-normal">
                    {headers.length}
                  </span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <KeyValueEditor
                pairs={headers}
                onChange={onHeadersChange}
                keyPlaceholder="Key"
                valuePlaceholder="Value"
                addLabel="Add Header"
                emptyLabel="No headers added yet"
                showToggle
                keySuggestions={headerKeySuggestions}
                valueSuggestions={valueVarSuggestions}
              />
            </AccordionContent>
          </AccordionItem>

          <BodyEditor
            body={body}
            bodyType={bodyType}
            onBodyChange={onBodyChange}
            onBodyTypeChange={onBodyTypeChange}
            environmentVariableNames={environmentVariableNames}
            formDataKeySuggestions={formDataKeySuggestions}
          />

          <AuthSection
            authType={authType}
            authToken={authToken}
            onAuthChange={onAuthChange}
            environmentVariableNames={environmentVariableNames}
          />

          {/* Tests */}
          <AccordionItem value="tests" className="border border-border rounded-lg px-4">
            <AccordionTrigger className="py-3 text-xs font-semibold uppercase tracking-wider hover:no-underline [&[data-state=open]>svg]:rotate-180">
              <span className="flex items-center gap-2">
                <FlaskConical className="size-3.5" />
                Tests
                {(assertions?.length ?? 0) > 0 && (
                  <span className="rounded-full bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] font-mono font-normal">
                    {assertions?.filter((a) => a.enabled).length ?? 0}/{assertions?.length ?? 0}
                  </span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <TestAssertionPanel
                assertions={assertions ?? []}
                onChange={
                  onAssertionsChange ??
                  ((_assertions: RequestTestAssertion[]) => {
                    console.warn(
                      "[RequestPanel] onAssertionsChange not provided — assertion changes ignored",
                    );
                  })
                }
                onRunTests={onRunTests}
              />
            </AccordionContent>
          </AccordionItem>

          {/* Assertions (test-runner) */}
          <AccordionItem value="assertions-runner" className="border border-border rounded-lg px-4">
            <AccordionTrigger className="py-3 text-xs font-semibold uppercase tracking-wider hover:no-underline [&[data-state=open]>svg]:rotate-180">
              <span className="flex items-center gap-2">
                <FlaskConical className="size-3.5" />
                Assertions
                {(runnerAssertions?.length ?? 0) > 0 && (
                  <span className="rounded-full bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] font-mono font-normal">
                    {runnerAssertions?.length ?? 0}
                  </span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <AssertionEditor
                assertions={runnerAssertions ?? []}
                onChange={onRunnerAssertionsChange ?? (() => {})}
              />
            </AccordionContent>
          </AccordionItem>

          {/* Scripts */}
          <AccordionItem value="scripts" className="border border-border rounded-lg px-4">
            <AccordionTrigger className="py-3 text-xs font-semibold uppercase tracking-wider hover:no-underline [&[data-state=open]>svg]:rotate-180">
              <span className="flex items-center gap-2">
                <Code className="size-3.5" />
                Scripts
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <ScriptEditor
                preRequestScript={preRequestScript}
                postResponseScript={postResponseScript}
                onPreChange={onPreRequestScriptChange ?? (() => {})}
                onPostChange={onPostResponseScriptChange ?? (() => {})}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}

const assertionTypeLabels: Record<AssertionType, string> = {
  status: "Status Code",
  bodyContains: "Body Contains",
  headerExists: "Header Exists",
  jsonPath: "JSON Path",
};

function TestAssertionPanel({
  assertions,
  onChange,
  onRunTests,
}: {
  assertions: RequestTestAssertion[];
  onChange: (assertions: RequestTestAssertion[]) => void;
  onRunTests?: () => void;
}) {
  const addAssertion = () => {
    const newAssertion: RequestTestAssertion = {
      id: `assert-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      type: "status",
      target: "200",
      expected: "",
      enabled: true,
    };
    onChange([...assertions, newAssertion]);
  };

  const removeAssertion = (index: number) => {
    onChange(assertions.filter((_, i) => i !== index));
  };

  const updateAssertion = (index: number, patch: Partial<RequestTestAssertion>) => {
    onChange(assertions.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  };

  return (
    <div className="space-y-3">
      {assertions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-xs text-muted-foreground/60">
          <FlaskConical className="size-6 mb-2 text-muted-foreground/30" />
          <span>No assertions added yet</span>
        </div>
      )}
      {assertions.map((assertion, index) => (
        <div
          key={assertion.id}
          className="group/assertion flex items-start gap-2 rounded-lg border border-border bg-muted/10 p-2.5 transition-all duration-200 hover:bg-muted/20"
        >
          <div className="flex flex-1 flex-col gap-2 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={assertion.type}
                onValueChange={(value) => updateAssertion(index, { type: value as AssertionType })}
              >
                <SelectTrigger className="h-8 w-36 border-input bg-muted/20 text-xs font-medium transition-all duration-200 hover:border-muted-foreground/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["status", "bodyContains", "headerExists", "jsonPath"] as AssertionType[]).map(
                    (t) => (
                      <SelectItem key={t} value={t}>
                        {assertionTypeLabels[t]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
              <Switch
                checked={assertion.enabled}
                onCheckedChange={(checked) => updateAssertion(index, { enabled: checked })}
                className="data-[state=checked]:bg-success"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                type="text"
                value={assertion.target}
                onChange={(e) => updateAssertion(index, { target: e.target.value })}
                placeholder={
                  assertion.type === "status"
                    ? "200 or >= 200 && < 300"
                    : assertion.type === "bodyContains"
                      ? "text to find"
                      : assertion.type === "headerExists"
                        ? "header-name"
                        : "$.data.id"
                }
                className="flex-1 h-8 border-input bg-muted/20 text-xs transition-all duration-200 focus:bg-muted/40 min-w-0"
              />
              {assertion.type !== "status" && (
                <Input
                  type="text"
                  value={assertion.expected ?? ""}
                  onChange={(e) => updateAssertion(index, { expected: e.target.value })}
                  placeholder={
                    assertion.type === "jsonPath" ? "expected value" : "expected value (optional)"
                  }
                  className="flex-1 h-8 border-input bg-muted/20 text-xs transition-all duration-200 focus:bg-muted/40 min-w-0"
                />
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => removeAssertion(index)}
            className="shrink-0 size-7 text-muted-foreground/50 hover:text-destructive opacity-0 group-hover/assertion:opacity-100 transition-all duration-200"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={addAssertion}
          className="flex-1 border-dashed border-muted-foreground/20 text-muted-foreground/70 hover:text-foreground hover:border-muted-foreground/40 transition-all duration-200 h-9 text-xs font-medium"
        >
          <Plus className="size-3.5 mr-1" />
          Add Assertion
        </Button>
        {onRunTests && (
          <Button
            variant="outline"
            onClick={onRunTests}
            className="h-9 gap-1.5 text-xs font-medium border-dashed border-muted-foreground/20 text-muted-foreground/70 hover:text-foreground hover:border-muted-foreground/40 transition-all duration-200"
          >
            <Play className="size-3.5" />
            Run Tests
          </Button>
        )}
      </div>
    </div>
  );
}
