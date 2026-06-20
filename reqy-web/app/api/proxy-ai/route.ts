import { NextRequest, NextResponse } from "next/server"

type ProviderBody = {
  provider: string
  apiKey?: string
  model?: string
  openaiUrl?: string
  host?: string
  port?: string | number
  system?: string
  message?: string
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ProviderBody
  const provider = typeof body.provider === "string" ? body.provider.trim() : ""
  const message = typeof body.message === "string" ? body.message.trim() : ""
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : ""
  const model = typeof body.model === "string" ? body.model.trim() : ""
  const system = typeof body.system === "string" ? body.system : ""
  const host = typeof body.host === "string" && body.host.trim() ? body.host.trim() : "127.0.0.1"
  const port = typeof body.port === "string"
    ? body.port.trim()
    : typeof body.port === "number"
    ? String(body.port)
    : ""
  const ollamaPort = port || process.env.OLLAMA_PORT || "11434"

  if (!provider) {
    return NextResponse.json({ error: "Missing provider" }, { status: 400 })
  }

  if (!message && provider !== "ollama") {
    return NextResponse.json({ error: "Missing message" }, { status: 400 })
  }

  const PROVIDERS_WITH_API_KEY = new Set(["openai", "openrouter", "anthropic", "gemini", "deepseek"])
  if (PROVIDERS_WITH_API_KEY.has(provider) && !apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 400 })
  }

  function tryParseGeminiError(raw: string): string {
    try {
      const parsed = JSON.parse(raw)
      return parsed.error?.message ?? parsed.error ?? raw
    } catch {
      return raw
    }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000)

    function abortableFetch(url: string, init: RequestInit) {
      return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout))
    }

    if (provider === "anthropic") {
      const res = await abortableFetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: model || "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system,
          messages: [{ role: "user", content: message }],
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        return NextResponse.json({ error: data.error?.message ?? data.error ?? "Anthropic error" }, { status: res.status })
      }
      const content = ((Array.isArray(data.content) ? data.content : []) as Array<{
        type?: string
        text?: string
      }>)
        .reduce((acc, item) => item.type === "text" ? acc + (item.text || "") : acc, "")
      return NextResponse.json({ content })
    }

    if (provider === "openai" || provider === "openrouter") {
      const url = provider === "openai"
        ? body.openaiUrl && body.openaiUrl.trim()
          ? body.openaiUrl.trim().replace(/\/+$/, "").endsWith("/chat/completions")
            ? body.openaiUrl.trim().replace(/\/+$/, "")
            : body.openaiUrl.trim().replace(/\/+$/, "") + "/chat/completions"
          : "https://api.openai.com/v1/chat/completions"
        : "https://openrouter.ai/api/v1/chat/completions"
      const res = await abortableFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || (provider === "openrouter" ? "openai/gpt-5.2" : "gpt-3.5-turbo"),
          messages: [
            { role: "system", content: system },
            { role: "user", content: message },
          ],
        }),
      })
      const rawText = await res.text()
      let data: any
      try {
        data = JSON.parse(rawText)
      } catch {
        data = { error: rawText }
      }
      if (!res.ok) {
        return NextResponse.json({ error: data.error?.message ?? data.error ?? `${provider} error` }, { status: res.status })
      }
      return NextResponse.json({ content: data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? "" })
    }

    if (provider === "deepseek") {
      const res = await abortableFetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || "deepseek-chat",
          messages: [
            { role: "system", content: system },
            { role: "user", content: message },
          ],
        }),
      })
      const rawText = await res.text()
      let data: any
      try {
        data = JSON.parse(rawText)
      } catch {
        data = { error: rawText }
      }
      if (!res.ok) {
        return NextResponse.json({ error: data.error?.message ?? data.error ?? "DeepSeek error" }, { status: res.status })
      }
      return NextResponse.json({ content: data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? "" })
    }

    if (provider === "gemini") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.0-flash"}:generateContent`
      const res = await abortableFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ parts: [{ text: message }] }],
        }),
      })

      const contentType = res.headers.get("content-type") || ""

      if (contentType.includes("text/event-stream")) {
        const rawText = await res.text()
        let combined = ""
        for (const line of rawText.split("\n")) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6).trim()
            if (!jsonStr || jsonStr === "[DONE]") continue
            try {
              const chunk = JSON.parse(jsonStr)
              const text =
                chunk.candidates?.[0]?.content?.parts?.[0]?.text ||
                chunk.candidates?.[0]?.content?.text ||
                chunk.text ||
                ""
              combined += text
            } catch {
              // skip malformed chunks
            }
          }
        }
        if (!res.ok && !combined) {
          const errData = tryParseGeminiError(rawText)
          return NextResponse.json({ error: errData }, { status: res.status })
        }
        return NextResponse.json({ content: combined })
      }

      const rawText = await res.text()
      let data: any
      try {
        data = JSON.parse(rawText)
      } catch {
        data = {}
      }

      if (!res.ok) {
        const errMsg = data.error?.message ?? data.error ?? tryParseGeminiError(rawText) ?? "Gemini error"
        return NextResponse.json({ error: errMsg }, { status: res.status })
      }

      const promptFeedback = data.promptFeedback?.blockReason
      if (promptFeedback) {
        return NextResponse.json({
          content: "",
          blocked: true,
          reason: promptFeedback,
        })
      }

      const content =
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        data.candidates?.[0]?.content?.text ||
        data.candidates?.[0]?.content?.[0]?.text ||
        data.candidates?.[0]?.output?.[0]?.content?.[0]?.text ||
        data.candidates?.[0]?.output?.[0]?.content ||
        data.candidates?.[0]?.content ||
        data.output?.[0]?.content?.text ||
        data.output?.text ||
        ""
      return NextResponse.json({ content })
    }

    if (provider === "ollama") {
      const res = await abortableFetch(`http://${host}:${ollamaPort}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "keep-alive" },
        body: JSON.stringify({
          model: model || "llama2",
          messages: [
            ...(system ? [{ role: "system", content: system }] : []),
            { role: "user", content: message },
          ],
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        return NextResponse.json({ error: data.error?.message ?? data.error ?? "Ollama error" }, { status: res.status })
      }
      return NextResponse.json({ content: data.choices?.[0]?.message?.content ?? "" })
    }

    return NextResponse.json({ error: "Unknown provider" }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
