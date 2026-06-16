import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    authenticated: false,
    message: "Postman integration not configured",
  })
}

export async function POST() {
  return NextResponse.json(
    {
      authenticated: false,
      message: "Postman integration not configured",
    },
    { status: 501 },
  )
}
