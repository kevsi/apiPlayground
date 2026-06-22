import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest } from "../../auth/session"
import { createSupabaseServiceClient } from "../../../lib/supabase-server"
import { SyncPullQuerySchema } from "@/lib/sync-schema"

export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request)
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const rawSince = searchParams.get("since")
    const workspaceId = searchParams.get("workspaceId") || undefined

    const queryParse = SyncPullQuerySchema.safeParse({
      since: rawSince ? Number(rawSince) : undefined,
      workspaceId,
    })

    if (!queryParse.success) {
      return NextResponse.json({ error: "Invalid query parameters", details: queryParse.error.format() }, { status: 400 })
    }

    const since = queryParse.data.since
    const sinceIso = since ? new Date(since).toISOString() : new Date(0).toISOString()

    const supabase = createSupabaseServiceClient()

    let dbQuery = supabase
      .from("sync_items")
      .select("id, item_type, item_id, workspace_id, payload, updated_at, deleted")
      .eq("user_id", session.userId)
      .gt("updated_at", sinceIso)
      .order("updated_at", { ascending: true })
      .limit(500)

    if (workspaceId) {
      dbQuery = dbQuery.eq("workspace_id", workspaceId)
    }

    const { data, error } = await dbQuery

    if (error) {
      console.error("[sync/pull] Supabase error:", error)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }

    const rows = (data || []) as Array<{
      id: string
      item_type: string
      item_id: string
      workspace_id: string | null
      payload: unknown
      updated_at: string
      deleted: boolean
    }>

    const items = rows.map((row) => ({
      id: row.id,
      itemType: row.item_type,
      itemId: row.item_id,
      workspaceId: row.workspace_id,
      payload: row.payload,
      updatedAt: new Date(row.updated_at).getTime(),
      deleted: row.deleted,
    }))

    return NextResponse.json({ items, total: items.length })
  } catch (err) {
    console.error("[sync/pull] Unexpected error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
