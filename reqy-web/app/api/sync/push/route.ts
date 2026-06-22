import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest } from "../../auth/session"
import { createSupabaseServiceClient } from "../../../lib/supabase-server"
import { SyncPushBodySchema } from "@/lib/sync-schema"

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request)
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const parseResult = SyncPushBodySchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parseResult.error.format() },
        { status: 400 }
      )
    }

    const { items, deviceId } = parseResult.data
    const supabase = createSupabaseServiceClient()
    const now = new Date().toISOString()

    const rows = items.map((item) => ({
      user_id: session.userId,
      item_type: item.itemType,
      item_id: item.itemId,
      workspace_id: item.workspaceId || null,
      payload: item as unknown,
      updated_at: new Date(item.updatedAt).toISOString(),
      deleted: item.deleted ?? false,
    }))

    // Upsert with conflict on (user_id, item_type, item_id)
    const { error } = await supabase.from("sync_items").upsert(rows, {
      onConflict: "user_id,item_type,item_id",
      ignoreDuplicates: false,
    })

    if (error) {
      console.error("[sync/push] Supabase upsert error:", error)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }

    // Update sync_metadata
    await supabase.from("sync_metadata").upsert(
      {
        user_id: session.userId,
        device_id: deviceId,
        last_sync_at: now,
      },
      { onConflict: "user_id" }
    )

    return NextResponse.json({ success: true, pushed: items.length, syncedAt: new Date().getTime() })
  } catch (err) {
    console.error("[sync/push] Unexpected error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
