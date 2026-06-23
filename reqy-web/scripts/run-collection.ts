#!/usr/bin/env tsx
import fs from "node:fs/promises"
import path from "node:path"
import { runCollection } from "../lib/test-runner/runner"
import { toJUnitXml } from "../lib/test-runner/junit-export"
import { loadJsonDataset, loadCsvDataset } from "../lib/test-runner/data-driven"
import type { Collection } from "../hooks/request-types"

interface CliOptions {
  collection: string
  junit?: string
  dataset?: string
  env?: string
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2)
  const opts: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2)
      const val = args[i + 1]
      if (val && !val.startsWith("--")) {
        opts[key] = val
        i++
      }
    }
  }
  return opts as unknown as CliOptions
}

async function main() {
  const opts = parseArgs()
  if (!opts.collection) {
    console.error("Usage: tsx scripts/run-collection.ts --collection <path-to-collection.json> [--dataset <path>] [--env <name>] [--junit <report.xml>]")
    process.exit(2)
  }
  const collectionPath = path.resolve(opts.collection)
  const collection: Collection = JSON.parse(await fs.readFile(collectionPath, "utf-8"))

  let iterations
  if (opts.dataset) {
    const dsPath = path.resolve(opts.dataset)
    const content = await fs.readFile(dsPath, "utf-8")
    const format = dsPath.endsWith(".csv") ? "csv" : "json"
    const rows = format === "json" ? loadJsonDataset(content) : loadCsvDataset(content)
    iterations = rows.map((row, i) => ({
      environment: {},
      iterationData: row,
      iterationIndex: i,
      log: (m: string) => console.log(`[iter ${i}] ${m}`),
    }))
  }

  const executor = async (r: { method: string; url: string; headers: Record<string, string>; body?: unknown }) => {
    const started = Date.now()
    const res = await fetch(r.url, {
      method: r.method,
      headers: r.headers,
      body: r.body as BodyInit | undefined,
    })
    const text = await res.text()
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { parsed = text }
    return {
      statusCode: res.status,
      responseTimeMs: Date.now() - started,
      body: parsed,
      headers: Object.fromEntries(res.headers.entries()),
    }
  }

  const report = await runCollection(
    collection,
    { environment: {}, iterationData: {}, iterationIndex: 0, log: (m: string) => console.log(m) },
    { executor, iterations }
  )

  console.log(`\nResults: ${report.summary.passed}/${report.summary.total} passed`)
  for (const r of report.results) {
    const icon = r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : "!"
    console.log(`  ${icon} ${r.requestName} (${r.statusCode ?? "-"}, ${r.responseTimeMs ?? "-"}ms)`)
  }

  if (opts.junit) {
    await fs.writeFile(opts.junit, toJUnitXml(report), "utf-8")
    console.log(`JUnit report written to ${opts.junit}`)
  }

  process.exit(report.summary.failed + report.summary.errored > 0 ? 1 : 0)
}

main().catch((err) => { console.error(err); process.exit(2) })
