import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { url, method, headers, body } = await request.json()

    if (!url || !method) {
      return NextResponse.json({ error: "Missing url or method" }, { status: 400 })
    }

    const response = await fetch(url, {
      method,
      headers: headers ?? {},
      body: body === undefined ? undefined : body,
    })

    const responseBody = await response.text()
    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    return NextResponse.json({
      status: response.status,
      body: responseBody,
      headers: responseHeaders,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
