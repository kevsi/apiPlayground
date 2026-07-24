"use client";

import { useState, useRef } from "react";
import { Plus, Trash2, Play, Code, Braces, Check, Copy, Loader2, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HttpMethod } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

import type { BodyType, AuthType, QueryParam, Header } from "@/lib/request-executor";
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

interface RequestPanelProps {
  method: HttpMethod;
  url: string;
  queryParams: QueryParam[];
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
}

export function RequestPanel({
  method,
  url,
  queryParams,
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
}: RequestPanelProps) {
  const [exportFormat, setExportFormat] = useState<"curl" | "fetch">("curl");

  const [exportCopied, setExportCopied] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);

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

          {/* URL Input */}
          <div className="relative flex-1">
            <Input
              ref={urlInputRef}
              data-testid="url-input"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder="https://api.example.com/endpoint"
              className="text-xs h-7 py-0 px-2"
            />
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
          <p className="mt-1 text-xs text-muted-foreground/70">
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
              />
            </AccordionContent>
          </AccordionItem>

          <BodyEditor
            body={body}
            bodyType={bodyType}
            onBodyChange={onBodyChange}
            onBodyTypeChange={onBodyTypeChange}
          />

          <AuthSection authType={authType} authToken={authToken} onAuthChange={onAuthChange} />

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
