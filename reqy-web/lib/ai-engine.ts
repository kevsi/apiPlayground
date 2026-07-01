/**
 * AI engine utilities for the API Playground.
 * - Types for AI context, actions and responses
 * - System prompt for the LLMs
 * - Prompt templates
 * - callAI wrapper for Anthropic / OpenAI / Ollama
 * - parseAIResponse helper
 * - dispatchAIActions to apply AI actions to app handlers
 *
 * Constraints: no external dependencies, strict TypeScript, native fetch.
 */

import type { HttpMethod } from "@/lib/types"
export type { HttpMethod as HTTPMethod }

export type KeyValue = Record<string, string>;

export type CurrentRequest = {
  method: HttpMethod;
  url: string;
  headers: KeyValue;
  params: KeyValue;
  body?: unknown;
  auth?: unknown;
};

// Re-exported from types.ts for convenience
import type { AIProvider as AIProviderType } from "@/lib/types"
export type AIProvider = AIProviderType;

export type LastResponse = {
  status: number;
  statusText?: string;
  durationMs?: number;
  headers: KeyValue;
  body?: unknown;
};

export type AIContext = {
  currentRequest: CurrentRequest;
  lastResponse?: LastResponse | null;
  environmentVariables: Record<string, string>;
  collectionHistory: CurrentRequest[];
  activeCollection?: string | null;
};

export type TestAssertion = {
  label: string;
  code: string;
};

/* AI Action payload definitions */
export type FillRequestAction = {
  type: "FILL_REQUEST";
  payload: Partial<CurrentRequest> & { reason?: string };
};

export type AddAssertionsAction = {
  type: "ADD_ASSERTIONS";
  payload: { assertions: TestAssertion[]; autoApply?: boolean };
};

export type CreateVariableAction = {
  type: "CREATE_VARIABLE";
  payload: { name: string; value?: string; fromResponsePath?: string; description?: string };
};

export type SuggestFixAction = {
  type: "SUGGEST_FIX";
  payload: { description: string; patch?: Partial<CurrentRequest>; autoApply?: boolean };
};

export type GenerateDocAction = {
  type: "GENERATE_DOC";
  payload: { markdown: string; title?: string };
};

export type ExplainAction = {
  type: "EXPLAIN";
  payload: { message: string };
};

export type ExecuteRequestAction = {
  type: "EXECUTE_REQUEST";
  payload: Partial<CurrentRequest> & { reason?: string };
};

export type RunBatchAction = {
  type: "RUN_BATCH";
  payload: { requests: Array<Partial<CurrentRequest>> };
};

export type AIAction =
  | FillRequestAction
  | AddAssertionsAction
  | CreateVariableAction
  | SuggestFixAction
  | GenerateDocAction
  | ExplainAction
  | ExecuteRequestAction
  | RunBatchAction;

export type AIResponse = {
  actions: AIAction[];
  summary: string;
};

/**
 * SYSTEM_PROMPT: Force models to return only JSON describing actions.
 * - Forbids free text replies
 * - Explains each action and provides an example JSON
 */
export const SYSTEM_PROMPT: string = `You are an AI assistant integrated into an API request playground. You must NOT produce free-form text output under any circumstances. You must respond ONLY with valid JSON following exactly this shape: { "summary": string, "actions": [ ... ] }.

Allowed actions (exact types):

- FILL_REQUEST: patches the request editor. Example:
  { "type": "FILL_REQUEST", "payload": { "method": "POST", "url": "https://api.example.com/users", "headers": {"Content-Type":"application/json"}, "body": {"name":"Alice"}, "reason":"Populate body with sample" } }

- ADD_ASSERTIONS: injects TestAssertion objects into the Tests tab. Example:
  { "type":"ADD_ASSERTIONS", "payload": { "assertions": [{"label":"Status is 200","code":"expect(response.status).toBe(200);"}], "autoApply": false } }

- CREATE_VARIABLE: extract a value from the last response and save into environment variables. Example:
  { "type":"CREATE_VARIABLE", "payload": { "name":"user_id","fromResponsePath":"$.id","description":"created user id" } }

- SUGGEST_FIX: propose (and optionally apply) a fix to the request. Example:
  { "type":"SUGGEST_FIX", "payload": { "description":"Use Bearer token from env","patch":{"headers":{"Authorization":"Bearer {{api_token}}"}}, "autoApply": false } }

- GENERATE_DOC: produce Markdown documentation for endpoints. Example:
  { "type":"GENERATE_DOC", "payload": { "markdown":"# Users\n..." } }

- EXPLAIN: display an explanatory message in the UI (short). Example:
  { "type":"EXPLAIN", "payload": { "message":"This endpoint returns the current user." } }

Rules:
- Use {{variable_name}} syntax when referencing environment variables.
- Generate at least 4 assertions when asked to produce tests.
- Only set "autoApply": true when you are highly confident the change is correct.
- The top-level JSON must be the only content returned (no surrounding markdown fences, no extra commentary).
`;

/**
 * PROMPTS: functions generating user prompts for the LLM given an AIContext.
 */
export const PROMPTS = {
  analyzeResponse: (ctx: AIContext): string => {
    const last = ctx.lastResponse;
    const status = last ? last.status : "no-response";
    const body = last?.body ? JSON.stringify(last.body).slice(0, 2000) : "none";
    const headers = last?.headers ? JSON.stringify(last.headers) : "none";
    const envVars = Object.keys(ctx.environmentVariables)
      .map((key) => `{{${key}}}`)
      .join(", ") || "none";
    return `Analyze the last response for ${ctx.currentRequest.method} ${ctx.currentRequest.url}.
Status: ${status}
Response body: ${body}
Response headers: ${headers}
Available env variables: ${envVars}
If status is 4xx/5xx → return SUGGEST_FIX + EXPLAIN. If status is 2xx → return ADD_ASSERTIONS (min 4) + CREATE_VARIABLE if token/id found. Return JSON only.`;
  },
  generateTests: (ctx: AIContext): string => {
    return `Generate at least 5 categories of assertions for request ${ctx.currentRequest.method} ${ctx.currentRequest.url}.
Categories: 1) status codes, 2) response time, 3) content-type header, 4) body structure / required fields, 5) business logic correctness. Produce TestAssertion objects with label and JavaScript test code suitable for the app's Tests tab. Use {{variable_name}} for env values. Return JSON only.`;
  },
  naturalLanguageToRequest: (description: string, ctx: AIContext): string => {
    // Delegates to the canonical prompt builder in cloud-engine/generate.ts (Phase 6.1).
    const envVars = ctx.environmentVariables ?? {};
    const envList = Object.entries(envVars)
      .map(([key, value]) => `- {{${key}}} = ${String(value).slice(0, 40)}`)
      .join("\n") || "none";
    return `Convert the natural language description into a complete HTTP request. Description: "${description}".
Available env variables (use them when appropriate):\n${envList}
Provide method, full URL, headers, params, and a sample body if applicable. Use {{variable_name}} for secrets or env variables. Return JSON with an action FILL_REQUEST only.`;
  },
  debugError: (ctx: AIContext): string => {
    const last = ctx.lastResponse;
    const status = last ? last.status : "unknown";
    return `Debug the error for request ${ctx.currentRequest.method} ${ctx.currentRequest.url}. Last status: ${status}. Diagnose likely root causes, propose a concrete SUGGEST_FIX with a patch, and list any variables to create. Return JSON only with actions SUGGEST_FIX, CREATE_VARIABLE and EXPLAIN as appropriate.`;
  },
  generateDocs: (requests: CurrentRequest[]): string => {
    const list = requests
      .map((r) => `- ${r.method} ${r.url}`)
      .join("\n");
    return `Generate Markdown documentation for the following endpoints:\n${list}\nInclude summary, example request (with {{variables}}), example response schema, and quick usage notes. Return JSON only with GENERATE_DOC action containing the Markdown.`;
  },
  graphqlFromDescription: (description: string, schemaHint?: string): string => {
    const schema = schemaHint
      ? `\nIntrospection schema (truncated):\n${schemaHint.slice(0, 4000)}\n`
      : "\nNo introspection schema available — use sensible defaults.\n"
    return `You are a GraphQL expert. Convert the natural language description into a valid GraphQL query.
${schema}
Description: "${description}"

Rules:
- Output ONLY the GraphQL query string, no prose, no markdown fences.
- Use the introspection schema if available; otherwise pick fields that match the description.
- Use $variables for dynamic values when the description implies them.
- Prefer query (not mutation) unless the description clearly writes data.
- Indent with 2 spaces.

Example output:
query GetUser($id: ID!) {
  user(id: $id) {
    id
    name
    email
  }
}`
  },
  graphqlFixFromError: (query: string, errorMessage: string): string => {
    return `You are a GraphQL expert. The user query below produced the given error. Output ONLY a corrected GraphQL query string (no prose, no markdown fences).

Query:
${query}

Error: ${errorMessage}

Corrected query:`
  },
};

/**
 * Parse raw model output into AIResponse.
 * - Strips markdown code fences and backticks
 * - Attempts JSON.parse, falling back to substring heuristics
 */
function isValidAIResponse(value: unknown): value is AIResponse {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.summary !== "string") return false;
  if (!Array.isArray(obj.actions)) return false;
  for (const action of obj.actions) {
    if (typeof action !== "object" || action === null) return false;
    const a = action as Record<string, unknown>;
    if (typeof a.type !== "string") return false;
    if (typeof a.payload !== "object" || a.payload === null) return false;
  }
  return true;
}

const FETCH_TIMEOUT = 30000;

async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number }): Promise<Response> {
  const timeout = options.timeout ?? FETCH_TIMEOUT;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

export function parseAIResponse(raw: string): AIResponse {
  const cleaned = raw
    .replace(/```json\s*/g, "")
    .replace(/```/g, "")
    .replace(/`/g, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (isValidAIResponse(parsed)) return parsed;
  } catch {
    // continue to fallback
  }

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const sub = cleaned.substring(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(sub);
      if (isValidAIResponse(parsed)) return parsed;
    } catch {
      // fall through
    }
  }

  return {
    summary: "The AI response could not be parsed.",
    actions: [
      {
        type: "EXPLAIN",
        payload: { message: "The AI response could not be parsed as JSON. Check the developer console for details." },
      },
    ],
  };
}

function resolvePath(obj: unknown, path: string): string | undefined {
  const cleaned = path.replace(/^\$\./, "");
  const keys = cleaned.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current != null ? String(current) : undefined;
}

/**
 * callAI: calls the selected AI provider and returns parsed AIResponse.
 * @param userPrompt - prompt string to send as user content
 * @param config - provider configuration
 */
export async function callAI(
  userPrompt: string,
  config: {
    provider: AIProvider;
    apiKey?: string;
    model?: string;
    openaiUrl?: string;
    ollamaUrl?: string;
  }
): Promise<AIResponse> {
  const provider = config.provider;
  const model = config.model
    ? config.model
    : provider === "anthropic"
    ? "claude-sonnet-4-20250514"
    : provider === "openai"
    ? "gpt-4o"
    : provider === "deepseek"
    ? "deepseek-chat"
    : provider === "opencode-zen"
    ? "gpt-5"
    : provider === "custom"
    ? "gpt-4o-mini"
    : provider === "grok"
    ? "grok-2"
    : "llama3";

  const system = SYSTEM_PROMPT;

  try {
    if (provider === "anthropic" || provider === "openai" || provider === "custom" || provider === "grok") {
      if (!config.apiKey) throw new Error(`${provider} requires apiKey in config`);
    const extra = (provider === "openai" || provider === "custom" || provider === "grok") && config.openaiUrl ? { openaiUrl: config.openaiUrl } : {};
      const res = await fetchWithTimeout("/api/proxy-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: config.apiKey,
          model,
          system,
          message: userPrompt,
          ...extra,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${provider} proxy error ${res.status}: ${text}`);
      }

      const data = await res.json();
      const content = typeof data.content === "string" ? data.content : JSON.stringify(data);
      return parseAIResponse(String(content));
    }

    if (provider === "opencode-zen") {
      if (!config.apiKey) throw new Error(`${provider} requires apiKey in config`);
      const res = await fetchWithTimeout("/api/proxy-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: config.apiKey,
          model,
          system,
          message: userPrompt,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${provider} proxy error ${res.status}: ${text}`);
      }

      const data = await res.json();
      const content = typeof data.content === "string" ? data.content : JSON.stringify(data);
      return parseAIResponse(String(content));
    }

    if (provider === "openrouter" || provider === "gemini" || provider === "deepseek") {
      if (!config.apiKey) throw new Error(`${provider} requires apiKey in config`);
      const res = await fetchWithTimeout("/api/proxy-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: config.apiKey,
          model,
          system,
          message: userPrompt,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${provider} proxy error ${res.status}: ${text}`);
      }

      const data = await res.json();
      const content = typeof data.content === "string" ? data.content : JSON.stringify(data);
      return parseAIResponse(String(content));
    }

    if (provider === "ollama") {
      const url = config.ollamaUrl ?? "http://localhost:11434";
      const res = await fetchWithTimeout(`${url}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "keep-alive" },
        body: JSON.stringify({ model: model ?? "llama3", stream: false, messages: [{ role: "system", content: system }, { role: "user", content: userPrompt }] }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ollama API error ${res.status}: ${text}`);
      }

      const data = await res.json();
      const content = data && data.message && data.message.content ? data.message.content : JSON.stringify(data);
      return parseAIResponse(String(content));
    }

    throw new Error(`Unsupported provider: ${provider}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      summary: "AI call failed.",
      actions: [
        {
          type: "EXPLAIN",
          payload: {
            message: `AI call failed: ${message}`,
          },
        },
      ],
    };
  }
}

export async function callAIText(
  userPrompt: string,
  config: {
    provider: AIProvider;
    apiKey?: string;
    model?: string;
    openaiUrl?: string;
    ollamaUrl?: string;
    system?: string;
  }
): Promise<string> {
  const provider = config.provider;
  const model = config.model
    ? config.model
    : provider === "anthropic"
    ? "claude-sonnet-4-20250514"
    : provider === "openai"
    ? "gpt-4o"
    : provider === "deepseek"
    ? "deepseek-chat"
    : provider === "opencode-zen"
    ? "gpt-5"
    : provider === "custom"
    ? "gpt-4o-mini"
    : provider === "grok"
    ? "grok-2"
    : "llama3";

  const system = config.system ?? SYSTEM_PROMPT;

  if (provider === "anthropic" || provider === "openai" || provider === "custom" || provider === "grok") {
    if (!config.apiKey) throw new Error(`${provider} requires apiKey in config`);
    const extra = (provider === "openai" || provider === "custom" || provider === "grok") && config.openaiUrl ? { openaiUrl: config.openaiUrl } : {};
    const res = await fetchWithTimeout("/api/proxy-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        apiKey: config.apiKey,
        model,
        system,
        message: userPrompt,
        ...extra,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${provider} proxy error ${res.status}: ${text}`);
    }

    const data = await res.json();
    return typeof data.content === "string" ? String(data.content) : JSON.stringify(data);
  }

  if (provider === "openrouter" || provider === "gemini" || provider === "deepseek" || provider === "opencode-zen") {
    if (!config.apiKey) throw new Error(`${provider} requires apiKey in config`);
    const res = await fetchWithTimeout("/api/proxy-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        apiKey: config.apiKey,
        model,
        system,
        message: userPrompt,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${provider} proxy error ${res.status}: ${text}`);
    }

    const data = await res.json();
    return typeof data.content === "string" ? String(data.content) : JSON.stringify(data);
  }

  if (provider === "ollama") {
    const url = config.ollamaUrl ?? "http://localhost:11434";
    const res = await fetchWithTimeout(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Connection: "keep-alive" },
      body: JSON.stringify({
        model: model ?? "llama3",
        stream: false,
        messages: [{ role: "system", content: system }, { role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    return data && data.message && data.message.content ? String(data.message.content) : JSON.stringify(data);
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

/**
 * dispatchAIActions: given parsed actions and handlers, call the appropriate handlers.
 * Handlers are optional; missing handlers are skipped but notify is called for SUGGEST_FIX.
 */
export async function dispatchAIActions(
  actions: AIAction[],
  handlers: {
    setRequest?: (patch: Partial<CurrentRequest>, reason?: string) => Promise<void> | void;
    addAssertions?: (assertions: TestAssertion[], autoApply?: boolean) => Promise<void> | void;
    setVariable?: (name: string, value: string, description?: string) => Promise<void> | void;
    applyFix?: (patch: Partial<CurrentRequest>) => Promise<void> | void;
    setDoc?: (markdown: string, title?: string) => Promise<void> | void;
    notify?: (message: string) => Promise<void> | void;
    executeRequest?: (request: Partial<CurrentRequest>) => Promise<any> | void;
    runBatch?: (requests: Array<Partial<CurrentRequest>>) => Promise<any[]> | void;
    audit?: (entry: { actionType: string; detail?: any; result?: any }) => Promise<any> | void;
  },
  ctx?: AIContext,
  options?: { allowAutoApply?: boolean }
): Promise<void> {
  for (const action of actions) {
    switch (action.type) {
      case "FILL_REQUEST": {
        try {
          await handlers.setRequest?.(action.payload, action.payload.reason);
          // If AI requested to run the request (payload.run === true) and autoApply allowed, execute it
          try {
            const shouldRun = !!(action.payload as any).run
            if (shouldRun && options?.allowAutoApply) {
                const res = await handlers.executeRequest?.(action.payload as any)
                await handlers.audit?.({ actionType: "FILL_REQUEST_RUN", detail: action.payload, result: res })
            }
          } catch (e) {
            await handlers.notify?.(`FILL_REQUEST run error: ${String(e)}`)
          }
        } catch (e) {
          await handlers.notify?.(`FILL_REQUEST handler error: ${String(e)}`);
        }
        break;
      }

      case "ADD_ASSERTIONS": {
        try {
          const shouldAuto = Boolean(action.payload.autoApply) && Boolean(options?.allowAutoApply);
          const res = await handlers.addAssertions?.(action.payload.assertions, shouldAuto);
          if (shouldAuto) await handlers.audit?.({ actionType: "ADD_ASSERTIONS_AUTO", detail: action.payload, result: res })
        } catch (e) {
          await handlers.notify?.(`ADD_ASSERTIONS handler error: ${String(e)}`);
        }
        break;
      }

      case "CREATE_VARIABLE": {
        try {
          let val = action.payload.value ?? "";
          if (!val && action.payload.fromResponsePath && ctx?.lastResponse?.body) {
            val = resolvePath(ctx.lastResponse.body, action.payload.fromResponsePath) ?? "";
          }
          await handlers.setVariable?.(action.payload.name, val, action.payload.description);
        } catch (e) {
          await handlers.notify?.(`CREATE_VARIABLE handler error: ${String(e)}`);
        }
        break;
      }

      case "SUGGEST_FIX": {
        try {
          await handlers.notify?.(action.payload.description ?? "Suggested fix available");
          if (action.payload.autoApply && options?.allowAutoApply) {
            if (action.payload.patch) {
              const res = await handlers.applyFix?.(action.payload.patch);
              await handlers.audit?.({ actionType: "SUGGEST_FIX_AUTO", detail: action.payload, result: res })
            }
          }
        } catch (e) {
          await handlers.notify?.(`SUGGEST_FIX handler error: ${String(e)}`);
        }
        break;
      }

      case "GENERATE_DOC": {
        try {
          await handlers.setDoc?.(action.payload.markdown, action.payload.title);
        } catch (e) {
          await handlers.notify?.(`GENERATE_DOC handler error: ${String(e)}`);
        }
        break;
      }

      case "EXPLAIN": {
        try {
          await handlers.notify?.(action.payload.message);
        } catch (e) {
          // Best effort
        }
        break;
      }

      case "EXECUTE_REQUEST": {
        try {
          await handlers.setRequest?.(action.payload, action.payload.reason);
          const res = await handlers.executeRequest?.(action.payload);
          await handlers.audit?.({ actionType: "EXECUTE_REQUEST", detail: action.payload, result: res });
        } catch (e) {
          await handlers.notify?.(`EXECUTE_REQUEST handler error: ${String(e)}`);
        }
        break;
      }

      case "RUN_BATCH": {
        try {
          const results: any[] = [];
          for (const req of action.payload.requests) {
            const res = await handlers.executeRequest?.(req);
            results.push({ request: req, result: res });
          }
          await handlers.runBatch?.(action.payload.requests);
          await handlers.audit?.({ actionType: "RUN_BATCH", detail: action.payload, result: results });
        } catch (e) {
          await handlers.notify?.(`RUN_BATCH handler error: ${String(e)}`);
        }
        break;
      }

      default: {
        await handlers.notify?.(`Unknown action type: ${(action as any).type}`);
        break;
      }
    }
  }
}
