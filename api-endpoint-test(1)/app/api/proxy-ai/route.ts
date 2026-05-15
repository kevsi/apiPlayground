import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    provider: string
    apiKey?: string
    model?: string
    system?: string
    message: string
  }

  try {
    if (body.provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": body.apiKey ?? "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: body.model ?? "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system: body.system,
          messages: [{ role: "user", content: body.message }],
        }),
      })
      const data = await res.json()
      if (!res.ok) return NextResponse.json({ error: data.error?.message ?? "Anthropic error" }, { status: res.status })
      const content = (data.content as { type: string; text: string }[])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("")
      return NextResponse.json({ content })
    }

    if (body.provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${body.apiKey ?? ""}`,
        },
        body: JSON.stringify({
          model: body.model ?? "gpt-4o",
          messages: [
            { role: "system", content: body.system },
            { role: "user", content: body.message },
          ],
        }),
      })
      const data = await res.json()
      if (!res.ok) return NextResponse.json({ error: data.error?.message ?? "OpenAI error" }, { status: res.status })
      return NextResponse.json({ content: data.choices?.[0]?.message?.content ?? "" })
    }

    if (body.provider === "gemini") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${body.model ?? "gemini-2.0-flash"}:generateContent?key=${body.apiKey ?? ""}`
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: body.system }] },
          contents: [{ parts: [{ text: body.message }] }],
        }),
      })
      const data = await res.json()
      if (!res.ok) return NextResponse.json({ error: data.error?.message ?? "Gemini error" }, { status: res.status })
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
      return NextResponse.json({ content })
    }

    return NextResponse.json({ error: "Unknown provider" }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
