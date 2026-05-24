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

export type HTTPMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD";

export type KeyValue = Record<string, string>;

export type CurrentRequest = {
  method: HTTPMethod;
  url: string;
  headers: KeyValue;
  params: KeyValue;
  body?: unknown;
  auth?: unknown;
};

export type AIProvider = "anthropic" | "openai" | "openrouter" | "gemini" | "deepseek" | "ollama";

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

export type AIAction =
  | FillRequestAction
  | AddAssertionsAction
  | CreateVariableAction
  | SuggestFixAction
  | GenerateDocAction
  | ExplainAction;

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
    const envVars = Object.entries(ctx.environmentVariables)
      .map(([key, value]) => `- {{${key}}} = ${String(value).slice(0, 40)}`)
      .join("\n") || "none";
    return `Convert the natural language description into a complete HTTP request. Description: "${description}".
Available env variables (use them when appropriate):\n${envVars}
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
};

/**
 * Parse raw model output into AIResponse.
 * - Strips markdown code fences and backticks
 * - Attempts JSON.parse, falling back to substring heuristics
 */
export function parseAIResponse(raw: string): AIResponse {
  const cleaned = raw
    .replace(/```json\s*/g, "")
    .replace(/```/g, "")
    .replace(/`/g, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as AIResponse;
    return parsed;
  } catch (err) {
    // Try to extract first JSON object from string
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const sub = cleaned.substring(firstBrace, lastBrace + 1);
      try {
        const parsed = JSON.parse(sub) as AIResponse;
        return parsed;
      } catch (e) {
        // fall through
      }
    }

    // As a last resort, return a minimal structured response indicating parse failure
    return {
      summary: "__PARSE_ERROR__ Could not parse model response as JSON.",
      actions: [
        {
          type: "EXPLAIN",
          payload: {
            message:
              "The AI response could not be parsed as JSON. Raw output attached to developer console.",
          },
        },
      ],
    };
  }
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
    : "llama3";

  const system = SYSTEM_PROMPT;

  try {
    if (provider === "anthropic") {
      if (!config.apiKey) throw new Error("Anthropic requires apiKey in config");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          system,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Anthropic API error ${res.status}: ${text}`);
      }

      const data = await res.json();
      // expected data.content[0].text
      const raw = Array.isArray(data.content) && data.content[0] && data.content[0].text
        ? data.content[0].text
        : typeof data.text === "string"
        ? data.text
        : JSON.stringify(data);
      return parseAIResponse(String(raw));
    }

    if (provider === "openai") {
      if (!config.apiKey) throw new Error("OpenAI requires apiKey in config");
      const body = {
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
        // honor the requested response format if available; may be ignored by some models
        response_format: { type: "json_object" },
      } as Record<string, unknown>;

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenAI API error ${res.status}: ${text}`);
      }

      const data = await res.json();
      const content =
        data && data.choices && data.choices[0] && data.choices[0].message
          ? data.choices[0].message.content
          : JSON.stringify(data);
      return parseAIResponse(String(content));
    }

    if (provider === "openrouter" || provider === "gemini" || provider === "deepseek") {
      if (!config.apiKey) throw new Error(`${provider} requires apiKey in config`);
      const res = await fetch("/api/proxy-ai", {
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
      const content =
        data && typeof data === "object" && data !== null && "content" in data
          ? (data as Record<string, unknown>).content
          : data && typeof data === "object" && data !== null && "message" in data
          ? (data as Record<string, unknown>).message
          : JSON.stringify(data);
      return parseAIResponse(String(content));
    }

    if (provider === "ollama") {
      const url = config.ollamaUrl ?? "http://localhost:11434";
      const res = await fetch(`${url}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      summary: `__ERROR__ ${message}`,
      actions: [
        { type: "EXPLAIN", payload: { message: `AI call failed: ${message}` } },
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
    : "llama3";

  const system = config.system ?? SYSTEM_PROMPT;

  if (provider === "anthropic") {
    if (!config.apiKey) throw new Error("Anthropic requires apiKey in config");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    return Array.isArray(data.content) && data.content[0] && data.content[0].text
      ? String(data.content[0].text)
      : typeof data.text === "string"
      ? data.text
      : JSON.stringify(data);
  }

  if (provider === "openai") {
    if (!config.apiKey) throw new Error("OpenAI requires apiKey in config");
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
    };

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    return data && data.choices && data.choices[0] && data.choices[0].message
      ? String(data.choices[0].message.content)
      : JSON.stringify(data);
  }

  if (provider === "openrouter" || provider === "gemini" || provider === "deepseek") {
    if (!config.apiKey) throw new Error(`${provider} requires apiKey in config`);
    const res = await fetch("/api/proxy-ai", {
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
    if (data && typeof data === "object" && data !== null && "content" in data) {
      return String((data as Record<string, unknown>).content);
    }
    if (data && typeof data === "object" && data !== null && "message" in data) {
      return String((data as Record<string, unknown>).message);
    }
    return JSON.stringify(data);
  }

  if (provider === "ollama") {
    const url = config.ollamaUrl ?? "http://localhost:11434";
    const res = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  },
  ctx?: AIContext
): Promise<void> {
  for (const action of actions) {
    switch (action.type) {
      case "FILL_REQUEST": {
        try {
          await handlers.setRequest?.(action.payload, action.payload.reason);
        } catch (e) {
          await handlers.notify?.(`FILL_REQUEST handler error: ${String(e)}`);
        }
        break;
      }

      case "ADD_ASSERTIONS": {
        try {
          await handlers.addAssertions?.(action.payload.assertions, action.payload.autoApply ?? false);
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
          if (action.payload.autoApply) {
            if (action.payload.patch) {
              await handlers.applyFix?.(action.payload.patch);
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

      default: {
        await handlers.notify?.(`Unknown action type: ${(action as any).type}`);
        break;
      }
    }
  }
}
