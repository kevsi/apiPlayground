#!/usr/bin/env node

import { program, type Command } from "commander"
import fs from "node:fs"
import path from "node:path"
import readline from "node:readline"
import chalk from "chalk"
import { validateExportBundle, isValidExportBundle } from "./validator.js"
import { runCollection, runWorkspace, flattenRequests, executeRequest } from "./runner.js"
import { reportCLI, reportJSON, buildJUnit, buildHTML, writeReport, printSummary, printError } from "./reporters.js"
import { importOpenAPI } from "./openapi.js"
import { loadConfig } from "./config.js"
import type { ExportBundle, RunResult, RunnerContext, DiffResult, RequestItem } from "./types.js"

const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"))

const GLOBAL_OPTIONS = [
  ["--env <name>", "Select environment by name"],
  ["--timeout <ms>", "Request timeout in milliseconds", "30000"],
  ["--no-color", "Disable colored output"],
  ["--json", "Output NDJSON for CI"],
  ["--parallel", "Run requests in parallel"],
  ["--delay <ms>", "Delay between requests in ms", "0"],
  ["--iterations <n>", "Number of iterations", "1"],
  ["--data <file>", "Data file for iterations (CSV or JSON)"],
  ["--reporter <format>", "Reporter: cli, json, junit, html"],
  ["--output <path>", "Write report to file"],
  ["--snapshot", "Enable snapshot testing"],
  ["--update-snapshots", "Update saved snapshots"],
  ["--dotenv <file>", "Import .env file"],
] as const

for (const [flags, desc, defaultVal] of GLOBAL_OPTIONS) {
  if (defaultVal) program.option(flags, desc, defaultVal)
  else program.option(flags, desc)
}

// --- run ---
program
  .command("run <files...>")
  .description("Run one or more collection files")
  .option("--request <name>", "Run a single request by name")
  .action(async (files: string[], cmdOpts: { request?: string }) => {
    const opts = resolveOpts(program)
    if (!opts.color) chalk.level = 0

    let results: RunResult[] = []

    if (files.length === 1 && files[0].endsWith(".json")) {
      results = await loadAndRun(files[0], opts, cmdOpts.request)
    } else {
      results = await loadAndRunWorkspace(files, opts)
    }

    await emitResults(results, opts)
    if (results.filter((r) => !r.passed).length > 0) process.exit(1)
  })

// --- graphql ---
program
  .command("graphql <endpoint>")
  .description("Execute a GraphQL query")
  .requiredOption("--query <query>", "GraphQL query string")
  .option("--variables <json>", "Query variables as JSON")
  .option("--operation-name <name>", "Operation name")
  .action(async (endpoint: string, cmdOpts: { query: string; variables?: string; operationName?: string }) => {
    const opts = resolveOpts(program)
    if (!opts.color) chalk.level = 0

    const gqlBundle: ExportBundle = {
      version: "1.0",
      collections: [{
        name: "GraphQL Query",
        requests: [{
          name: cmdOpts.operationName || "GraphQL Query",
          method: "GRAPHQL",
          url: endpoint,
          endpoint: "/graphql",
          graphql: {
            query: cmdOpts.query,
            variables: cmdOpts.variables ? JSON.parse(cmdOpts.variables) : undefined,
            operationName: cmdOpts.operationName,
          },
        }],
      }],
    }

    const timeoutMs = parseInt(opts.timeout, 10) || 30000
    const results = await runCollection(gqlBundle, {
      envName: opts.env,
      timeoutMs,
      noColor: !opts.color,
      reporter: opts.reporter,
    })

    await emitResults(results, opts)
    if (results.filter((r) => !r.passed).length > 0) process.exit(1)
  })

// --- validate ---
program
  .command("validate <file>")
  .description("Validate the format of an exported JSON file")
  .action((filePath: string) => {
    const resolvedPath = path.resolve(filePath)
    if (!fs.existsSync(resolvedPath)) { printError(`File not found: ${resolvedPath}`); process.exit(1) }

    let bundle: unknown
    try { bundle = JSON.parse(fs.readFileSync(resolvedPath, "utf8")) }
    catch (e) { const msg = e instanceof Error ? e.message : String(e); printError(msg); process.exit(1) }

    const errors = validateExportBundle(bundle)
    if (errors.length === 0) { console.log(chalk.green("Valid export bundle")); process.exit(0) }
    else { for (const err of errors) printError(`  - ${err.path}: ${err.message}`); process.exit(1) }
  })

// --- openapi ---
program
  .command("openapi <file>")
  .description("Import an OpenAPI spec and generate requests")
  .option("--run", "Run the imported collection immediately")
  .option("--output <path>", "Write the generated collection JSON to file")
  .action(async (filePath: string, cmdOpts: { run?: boolean; output?: string }) => {
    const resolvedPath = path.resolve(filePath)
    if (!fs.existsSync(resolvedPath)) { printError(`File not found: ${resolvedPath}`); process.exit(1) }

    try {
      const content = fs.readFileSync(resolvedPath, "utf8")
      const bundle = importOpenAPI(content)
      const outputPath = cmdOpts.output || resolvedPath.replace(/\.\w+$/, "") + "-recli.json"
      fs.writeFileSync(outputPath, JSON.stringify(bundle, null, 2), "utf8")
      console.log(chalk.green(`Generated: ${outputPath} (${countRequests(bundle)} requests)`))

      if (cmdOpts.run) {
        const opts = resolveOpts(program)
        const timeoutMs = parseInt(opts.timeout, 10) || 30000
        console.log(chalk.cyan("\nRunning...\n"))
        const results = await runCollection(bundle, {
          envName: opts.env, timeoutMs, noColor: !opts.color, json: !!opts.json,
          parallel: !!opts.parallel, delayMs: opts.delay, reporter: opts.reporter, output: opts.output,
        })
        await emitResults(results, opts)
        if (results.filter((r) => !r.passed).length > 0) process.exit(1)
      }
    } catch (e) { const msg = e instanceof Error ? e.message : String(e); printError(msg); process.exit(1) }
  })

// --- init ---
program
  .command("init [name]")
  .description("Scaffold a new collection")
  .option("--graphql", "Create a GraphQL collection template")
  .action((name?: string, cmdOpts?: { graphql?: boolean }) => {
    const collectionName = name || "My Collection"
    const bundle: ExportBundle = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      collections: [{
        name: collectionName,
        requests: cmdOpts?.graphql
          ? [{
              name: "Sample GraphQL Query",
              method: "GRAPHQL",
              url: "https://api.example.com/graphql",
              endpoint: "/graphql",
              bodyType: "graphql",
              graphql: { query: "query { users { id name } }" },
            }]
          : [{
              name: "Sample GET",
              method: "GET",
              url: "https://jsonplaceholder.typicode.com/posts/1",
              endpoint: "/posts/1",
            }],
      }],
    }
    const fileName = collectionName.toLowerCase().replace(/\s+/g, "-") + ".json"
    fs.writeFileSync(fileName, JSON.stringify(bundle, null, 2), "utf8")
    console.log(chalk.green(`Created: ${fileName}`))
  })

// --- export ---
program
  .command("export <file>")
  .description("Export collection to curl commands")
  .action((filePath: string) => {
    const resolvedPath = path.resolve(filePath)
    if (!fs.existsSync(resolvedPath)) { printError(`File not found: ${resolvedPath}`); process.exit(1) }
    try {
      const bundle = JSON.parse(fs.readFileSync(resolvedPath, "utf8")) as ExportBundle
      for (const req of flattenRequests(bundle)) {
        console.log(`# ${req.name} (${req.method} ${req.url})`)
        console.log(toCurl(req))
        console.log()
      }
    } catch (e) { const msg = e instanceof Error ? e.message : String(e); printError(msg); process.exit(1) }
  })

// --- watch ---
program
  .command("watch <file>")
  .description("Watch collection file and re-run on changes")
  .action(async (filePath: string) => {
    const { watch } = await import("chokidar")
    const resolvedPath = path.resolve(filePath)
    console.log(chalk.cyan(`Watching ${resolvedPath}...`))
    let running = false

    const watcher = watch(resolvedPath, { persistent: true })

    // Clean shutdown on SIGINT/SIGTERM
    const cleanup = () => {
      watcher.close()
      process.exit(0)
    }
    process.on("SIGINT", cleanup)
    process.on("SIGTERM", cleanup)

    watcher.on("change", async () => {
      if (running) return; running = true
      console.clear()
      console.log(chalk.cyan(`\nFile changed. Re-running...\n`))
      try {
        const bundle = JSON.parse(fs.readFileSync(resolvedPath, "utf8")) as ExportBundle
        const opts = resolveOpts(program)
        const results = await runCollection(bundle, {
          envName: opts.env, timeoutMs: parseInt(opts.timeout, 10) || 30000,
          noColor: !opts.color, parallel: !!opts.parallel, delayMs: opts.delay, reporter: opts.reporter,
        })
        reportCLI(results)
        const failed = results.filter((r) => !r.passed).length
        const passed = results.length - failed
        console.log(`\n${chalk.green(`${passed} passed`)}${failed > 0 ? chalk.red(`, ${failed} failed`) : ""}`)
      } catch (e) { printError(e instanceof Error ? e.message : String(e)) }
      running = false
    })
    await new Promise(() => {})
  })

// --- diff ---
program
  .command("diff <before> <after>")
  .description("Compare two result JSON files")
  .action((beforeFile: string, afterFile: string) => {
    const before = loadResultsFile(beforeFile)
    const after = loadResultsFile(afterFile)
    const diffs = computeDiff(before, after)
    printDiff(diffs)
    if (diffs.some((d) => d.statusChanged || d.bodyChanged)) process.exit(1)
  })

// --- ui (TUI mode) ---
program
  .command("ui <file>")
  .description("Interactive terminal UI to explore and run requests")
  .action(async (filePath: string) => {
    const resolvedPath = path.resolve(filePath)
    if (!fs.existsSync(resolvedPath)) { printError(`File not found: ${resolvedPath}`); process.exit(1) }
    const content = fs.readFileSync(resolvedPath, "utf8")
    if (!isValidExportBundle(JSON.parse(content))) { printError("Invalid collection"); process.exit(1) }
    const bundle = JSON.parse(content) as ExportBundle
    await interactiveUI(bundle, resolvedPath)
  })

program.parse()

// --- helpers ---

async function loadAndRun(filePath: string, opts: ResolvedOpts, requestFilter?: string): Promise<RunResult[]> {
  const resolvedPath = path.resolve(filePath)
  if (!fs.existsSync(resolvedPath)) { printError(`File not found: ${resolvedPath}`); process.exit(1) }

  let bundle: unknown
  try { bundle = JSON.parse(fs.readFileSync(resolvedPath, "utf8")) }
  catch (e) { printError(`Failed to parse: ${e instanceof Error ? e.message : String(e)}`); process.exit(1) }

  const errors = validateExportBundle(bundle)
  if (errors.length > 0) { for (const err of errors) printError(`  - ${err.path}: ${err.message}`); process.exit(1) }

  const timeoutMs = parseInt(opts.timeout, 10)
  if (isNaN(timeoutMs) || timeoutMs < 1) { printError(`Invalid timeout: ${opts.timeout}`); process.exit(1) }

  return runCollection(bundle as ExportBundle, {
    envName: opts.env, timeoutMs, requestName: requestFilter,
    noColor: !opts.color, json: !!opts.json || opts.reporter === "json",
    parallel: !!opts.parallel, delayMs: opts.delay,
    iterations: opts.iterations, dataFile: opts.data,
    reporter: opts.reporter, output: opts.output,
    snapshot: opts.snapshot, updateSnapshots: opts.updateSnapshots,
    dotenv: opts.dotenv,
  })
}

async function loadAndRunWorkspace(files: string[], opts: ResolvedOpts): Promise<RunResult[]> {
  const timeoutMs = parseInt(opts.timeout, 10) || 30000
  return runWorkspace(files, {
    envName: opts.env, timeoutMs,
    noColor: !opts.color, json: !!opts.json,
    parallel: !!opts.parallel, delayMs: opts.delay,
    iterations: opts.iterations, dataFile: opts.data,
    reporter: opts.reporter, output: opts.output,
    snapshot: opts.snapshot, updateSnapshots: opts.updateSnapshots,
    dotenv: opts.dotenv,
  })
}

function toCurl(req: { method: string; url: string; headers?: Record<string, string>; body?: string }): string {
  let curl = `curl -X ${req.method} "${req.url}"`
  if (req.headers) for (const [k, v] of Object.entries(req.headers)) curl += ` \\\n  -H "${k}: ${v}"`
  if (req.body) curl += ` \\\n  -d '${req.body.replace(/'/g, "'\\''")}'`
  return curl
}

function countRequests(bundle: ExportBundle): number {
  return bundle.collections.reduce((sum, c) => sum + c.requests.length, 0)
}

function resolveOpts(prog: Command): ResolvedOpts {
  const cli = prog.opts<Record<string, string | boolean | undefined>>()
  const cfg = loadConfig()
  return {
    env: (cli.env as string) || cfg.env,
    timeout: (cli.timeout as string) || String(cfg.timeout || "30000"),
    color: cli.color !== false,
    json: !!cli.json || cfg.reporter === "json",
    parallel: !!cli.parallel || !!cfg.parallel,
    delay: parseInt((cli.delay as string) || String(cfg.delay || "0"), 10),
    iterations: parseInt((cli.iterations as string) || String(cfg.iterations || "1"), 10),
    data: (cli.data as string) || cfg.data,
    reporter: (cli.reporter as string) || cfg.reporter || "cli",
    output: (cli.output as string) || cfg.output,
    snapshot: !!cli.snapshot || !!cfg.snapshot,
    // Commander camelCase: --update-snapshots becomes updateSnapshots in opts
    updateSnapshots: !!(cli.updateSnapshots as boolean) || !!cfg.updateSnapshots,
    dotenv: (cli.dotenv as string) || cfg.dotenv,
  }
}

interface ResolvedOpts {
  env?: string; timeout: string; color: boolean; json: boolean; parallel: boolean
  delay: number; iterations: number; data?: string; reporter?: string; output?: string
  snapshot?: boolean; updateSnapshots?: boolean; dotenv?: string
}

async function emitResults(results: RunResult[], opts: ResolvedOpts): Promise<void> {
  const reporter = opts.reporter || (opts.json ? "json" : "cli")
  const outputPath = opts.output

  switch (reporter) {
    case "json": {
      const out = reportJSON(results)
      if (outputPath) writeReport(out, outputPath); else console.log(out)
      break
    }
    case "junit": {
      const out = buildJUnit(results)
      if (outputPath) writeReport(out, outputPath); else writeReport(out, `recli-report-${Date.now()}.xml`)
      break
    }
    case "html": {
      const out = buildHTML(results)
      if (outputPath) writeReport(out, outputPath); else writeReport(out, `recli-report-${Date.now()}.html`)
      break
    }
    default: { reportCLI(results); break }
  }
  printSummary(results, reporter === "json")
}

// --- diff ---

function loadResultsFile(fp: string): RunResult[] {
  const resolvedPath = path.resolve(fp)
  if (!fs.existsSync(resolvedPath)) { printError(`File not found: ${resolvedPath}`); process.exit(1) }
  const content = fs.readFileSync(resolvedPath, "utf8")
  const lines = content.trim().split("\n").filter(Boolean)
  if (lines.length === 1 && lines[0].startsWith("[")) return JSON.parse(content) as RunResult[]
  return lines.map((l) => JSON.parse(l)) as RunResult[]
}

/**
 * Compute diff between two result sets.
 * Matches requests by name (not index) so reordering doesn't produce false positives.
 */
function computeDiff(before: RunResult[], after: RunResult[]): DiffResult[] {
  const afterByName = new Map<string, RunResult>()
  for (const r of after) {
    // If duplicate names exist, keep the first occurrence
    if (!afterByName.has(r.name)) afterByName.set(r.name, r)
  }

  const diffs: DiffResult[] = []
  const seen = new Set<string>()

  // Walk through "before" and match by name
  for (const b of before) {
    seen.add(b.name)
    const a = afterByName.get(b.name)
    if (!a) {
      diffs.push({
        name: b.name, url: b.url,
        statusChanged: true, oldStatus: b.status, newStatus: 0,
        bodyChanged: true, oldDuration: b.durationMs, newDuration: 0,
        durationChanged: true, passedBefore: b.passed, passedAfter: false,
      })
      continue
    }
    const statusChanged = b.status !== a.status
    const bodyChanged = b.body !== a.body
    const durationChanged = Math.abs(b.durationMs - a.durationMs) > 100
    diffs.push({
      name: a.name, url: a.url,
      statusChanged, oldStatus: b.status, newStatus: a.status,
      bodyChanged, bodyDiff: bodyChanged ? simpleBodyDiff(b.body, a.body) : undefined,
      durationChanged, oldDuration: b.durationMs, newDuration: a.durationMs,
      passedBefore: b.passed, passedAfter: a.passed,
    })
  }

  // Handle "after" entries not in "before"
  for (const a of after) {
    if (!seen.has(a.name)) {
      diffs.push({
        name: a.name, url: a.url,
        statusChanged: true, oldStatus: 0, newStatus: a.status,
        bodyChanged: true, oldDuration: 0, newDuration: a.durationMs,
        durationChanged: true, passedBefore: false, passedAfter: a.passed,
      })
    }
  }

  return diffs
}

function simpleBodyDiff(before?: string, after?: string): string {
  if (!before && !after) return ""
  if (!before) return "(new)"
  if (!after) return "(removed)"
  return before.length !== after.length ? `${before.length} → ${after.length} bytes` : "content changed"
}

function printDiff(diffs: DiffResult[]): void {
  console.log(chalk.bold(`\nDiff Report (${diffs.length} requests)`))
  let changes = 0
  for (const d of diffs) {
    const hasChanges = d.statusChanged || d.bodyChanged || d.durationChanged
    if (hasChanges) changes++
    const icon = hasChanges ? chalk.yellow("~") : chalk.green("=")
    console.log(`\n${icon} ${chalk.bold(d.name)}`)
    console.log(`   ${d.url}`)
    if (d.statusChanged) console.log(`   ${chalk.yellow("status:")} ${d.oldStatus} → ${d.newStatus}`)
    else console.log(`   ${chalk.green("status:")} ${d.newStatus} (unchanged)`)
    if (d.bodyChanged) console.log(`   ${chalk.yellow("body:")}   ${d.bodyDiff || "changed"}`)
    if (d.durationChanged) console.log(`   ${chalk.yellow("time:")}  ${d.oldDuration}ms → ${d.newDuration}ms`)
    if (d.passedBefore !== d.passedAfter) console.log(`   ${chalk.yellow("result:")} ${d.passedBefore ? "pass" : "fail"} → ${d.passedAfter ? "pass" : "fail"}`)
  }
  console.log(chalk.bold(`\n${changes} changed, ${diffs.length - changes} unchanged`))
}

// --- TUI ---

async function interactiveUI(bundle: ExportBundle, filePath: string): Promise<void> {
  const requests = flattenRequests(bundle)
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  console.clear()
  console.log(chalk.cyan.bold(`\n  recli UI — ${bundle.collections[0].name}\n`))

  let running = true
  while (running) {
    console.log(chalk.dim("  Requests:"))
    // Paginate: show max 20 at a time
    const pageSize = 20
    for (let page = 0; page < requests.length; page += pageSize) {
      const slice = requests.slice(page, page + pageSize)
      for (let i = 0; i < slice.length; i++) {
        const r = slice[i]
        const idx = page + i + 1
        if (idx > 99) break // keep alignment clean
        const methodColor = methodToColor(r.method)
        console.log(`  ${chalk.dim(`${idx}.`)} ${methodColor(r.method)} ${chalk.dim(r.url)}  ${chalk.white(r.name)}`)
      }
      if (page + pageSize < requests.length) {
        console.log(chalk.dim(`  ... ${requests.length - page - pageSize} more`))
      }
    }
    console.log()
    console.log(`  ${chalk.dim("a)")} Run all    ${chalk.dim("q)")} Quit`)

    const answer = await ask(rl, "  Select: ")
    if (!answer) continue

    if (answer.toLowerCase() === "q") { running = false; break }
    if (answer.toLowerCase() === "a") {
      console.clear()
      console.log(chalk.cyan("\nRunning all requests...\n"))
      const ctx: RunnerContext = {
        vars: new Map(), envVars: new Map(),
        cookies: new Map(), iteration: 0,
      }
      for (const req of requests) {
        const result = await executeRequest(req, ctx, 30000)
        reportCLI([result])
      }
      console.log(chalk.dim("\nPress Enter to continue..."))
      await waitForEnter(rl)
      console.clear()
      continue
    }

    const idx = parseInt(answer, 10) - 1
    if (idx >= 0 && idx < requests.length) {
      await runSingleInteractive(rl, requests[idx])
      console.clear()
    }
  }

  rl.close()
}

async function runSingleInteractive(rl: readline.Interface, request: RequestItem): Promise<void> {
  console.clear()
  console.log(`\n  ${methodToColor(request.method)(request.method)} ${chalk.bold(request.name)}`)
  console.log(`  ${chalk.dim(request.url)}\n`)

  const ctx: RunnerContext = {
    vars: new Map(), envVars: new Map(),
    cookies: new Map(), iteration: 0,
  }
  const result = await executeRequest(request, ctx, 30000)

  const icon = result.passed ? chalk.green("✓") : chalk.red("✗")
  console.log(`\n  ${icon} ${chalk.bold(result.method)} ${result.url}`)
  console.log(`  ${result.passed ? chalk.green(result.status) : chalk.red(result.status)} ${chalk.dim(result.statusText)}  ${chalk.dim(`${result.durationMs}ms`)}`)

  if (result.error) console.log(`  ${chalk.red(result.error)}`)

  if (result.body) {
    const preview = result.body.length > 500 ? result.body.slice(0, 500) + "..." : result.body
    console.log(`\n  ${chalk.dim("Response:")}`)
    try {
      console.log(`  ${chalk.dim(JSON.stringify(JSON.parse(preview), null, 2))}`)
    } catch {
      console.log(`  ${chalk.dim(preview)}`)
    }
  }

  if (result.responseHeaders) {
    console.log(`\n  ${chalk.dim("Headers:")}`)
    for (const [k, v] of Object.entries(result.responseHeaders).slice(0, 10)) {
      console.log(`  ${chalk.dim(`${k}: ${v}`)}`)
    }
  }

  console.log(chalk.dim("\nPress Enter to return..."))
  await waitForEnter(rl)
}

function methodToColor(method: string) {
  const colors: Record<string, (s: string) => string> = {
    GET: chalk.green, POST: chalk.blue, PUT: chalk.yellow,
    PATCH: chalk.yellow, DELETE: chalk.red, HEAD: chalk.cyan,
    OPTIONS: chalk.magenta, GRAPHQL: chalk.magenta,
  }
  return colors[method] || chalk.white
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve))
}

function waitForEnter(rl: readline.Interface): Promise<void> {
  return new Promise((resolve) => {
    const onLine = () => { rl.removeListener("line", onLine); resolve() }
    rl.on("line", onLine)
    setTimeout(() => { rl.removeListener("line", onLine); resolve() }, 30000)
  })
}
