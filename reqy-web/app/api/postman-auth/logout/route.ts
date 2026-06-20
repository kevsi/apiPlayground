import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const resp = NextResponse.json({ message: "Déconnexion Postman réussie" })
  resp.cookies.delete("postman_api_key")
  return resp
}
