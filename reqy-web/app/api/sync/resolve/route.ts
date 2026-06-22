import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest } from "../../auth/session"
import { createSupabaseServiceClient } from "../../../lib/supabase-server"
import { SyncResolveBodySchema } from "@/lib/sync-schema"

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request)
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const parseResult = SyncResolveBodySchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parseResult.error.format() },
        { status: 400 }
      )
    }

    const { itemId, itemType, resolution, mergedData, deviceId } = parseResult.data
    const supabase = createSupabaseServiceClient()
    const now = new Date().toISOString()

    if (resolution === "local" || resolution === "merged") {
      // Upsert the resolved (local or merged) version back to the server
      const payload = resolution === "local"
        ? undefined // fetch local from DB? no — we expect client to send it in push afterwards
        : mergedData

      if (resolution === "merged" && payload !== undefined) {
        const { error } = await supabase.from("sync_items").upsert(
          {
            user_id: session.userId,
            item_type: itemType,
            item_id: itemId,
            payload: payload as unknown,
            updated_at: now,
            deleted: false,
          },
          { onConflict: "user_id,item_type,item_id", ignoreDuplicates: false }
        )

        if (error) {
          console.error("[sync/resolve] Supabase upsert error:", error)
          return NextResponse.json({ error: "Database error" }, { status: 500 })
        }
      }
    }

    // For "remote", the server data is already the winner — nothing to do
    await supabase.from("sync_metadata").upsert(
      {
        user_id: session.userId,
        device_id: deviceId,
        last_sync_at: now,
      },
      { onConflict: "user_id" }
    )

    return NextResponse.json({ success: true, resolution, itemId, itemType })
  } catch (err) {
    console.error("[sync/resolve] Unexpected error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
