/**
 * Phase 3 — Check the knowledge_chunks schema and apply the migration if missing.
 *
 * Usage:
 *   pnpm exec tsx --env-file=.env.local scripts/check-rag-schema.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("Missing Supabase env vars");
    process.exit(1);
  }

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // 1. Try to count rows in knowledge_chunks
  const { data, error } = await sb
    .from("knowledge_chunks")
    .select("id", { count: "exact", head: true });

  if (!error) {
    console.log("✅ knowledge_chunks table already exists.");
    console.log("   Row count:", data);
    process.exit(0);
  }

  if (error.code !== "PGRST205" && !error.message.includes("does not exist")) {
    console.error("❌ Unexpected error:", error.message);
    process.exit(1);
  }

  // 2. Table missing — print migration SQL for manual application
  const migrationPath = new URL(
    "../supabase/migrations/20250626000001_enable_pgvector_and_knowledge_chunks.sql",
    import.meta.url
  );
  const sql = await readFile(migrationPath, "utf-8");
  console.log("⚠️  Table missing. Migration SQL:");
  console.log("---");
  console.log(sql);
  console.log("---");
  console.log(
    "❌ Cannot apply DDL via REST API. Please apply manually:\n" +
      "   1. Open https://supabase.com/dashboard/project/xqshyabkvdmuthsklqpb/sql/new\n" +
      "   2. Paste the SQL above\n" +
      "   3. Click Run\n" +
      "   4. Re-run this script to verify"
  );
  process.exit(2);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
