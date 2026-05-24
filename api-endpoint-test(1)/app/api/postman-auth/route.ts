import { NextRequest, NextResponse } from "next/server"

const POSTMAN_API_BASE = "https://api.getpostman.com"

export async function POST(request: NextRequest) {
  const { apiKey } = await request.json()

  if (!apiKey || !apiKey.trim()) {
    return NextResponse.json(
      { message: "Clé API Postman requise" },
      { status: 400 }
    )
  }

  try {
    // Verify the API key by fetching user data
    const response = await fetch(`${POSTMAN_API_BASE}/me`, {
      headers: {
        "X-Api-Key": apiKey.trim(),
      },
    })

    if (!response.ok) {
      return NextResponse.json(
        { message: "Clé API Postman invalide" },
        { status: 401 }
      )
    }

    const data = await response.json()

    // Set secure cookie with the API key
    const resp = NextResponse.json({
      connected: true,
      user: {
        id: data.user?.id,
        name: data.user?.name,
        email: data.user?.email,
      },
    })

    resp.cookies.set("postman_api_key", apiKey.trim(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })

    return resp
  } catch (error) {
    return NextResponse.json(
      { message: "Erreur de vérification Postman" },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  const apiKey = request.cookies.get("postman_api_key")?.value

  if (!apiKey) {
    return NextResponse.json({
      connected: false,
      user: null,
    })
  }

  try {
    const response = await fetch(`${POSTMAN_API_BASE}/me`, {
      headers: {
        "X-Api-Key": apiKey,
      },
    })

    if (!response.ok) {
      const resp = NextResponse.json({
        connected: false,
        user: null,
      })
      resp.cookies.delete("postman_api_key")
      return resp
    }

    const data = await response.json()

    return NextResponse.json({
      connected: true,
      user: {
        id: data.user?.id,
        name: data.user?.name,
        email: data.user?.email,
      },
    })
  } catch {
    return NextResponse.json({
      connected: false,
      user: null,
    })
  }
}
