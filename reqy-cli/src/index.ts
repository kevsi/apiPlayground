#!/usr/bin/env node

import { program } from "commander"
import fs from "node:fs"
import path from "node:path"
import chalk from "chalk"
import { validateExportBundle } from "./validator.js"
import { runCollection } from "./runner.js"
import type { RunResult } from "./types.js"

program
  .name("reqly")
  .description("CLI for running Reqly collections in CI/CD")
  .version("0.1.0")
  .option("--env <name>", "Select environment by name")
  .option("--timeout <ms>", "Request timeout in milliseconds", "30000")
  .option("--no-color", "Disable colored output")
  .option("--json", "Output JSON for CI (one line per request)")

program
  .command("run <file>")
  .description("Run a collection from an exported JSON file")
  .option("--request <name>", "Run a single request by name")
  .action(async (filePath: string, options: { request?: string }) => {
    const globalOpts = program.opts<{
      env?: string
      timeout: string
      color: boolean
      json: boolean
    }>()

    if (globalOpts.color === false) {
      chalk.level = 0
    }

    const resolvedPath = path.resolve(filePath)
    if (!fs.existsSync(resolvedPath)) {
      console.error(chalk.red(`File not found: ${resolvedPath}`))
      process.exit(1)
    }

    let bundle: unknown
    try {
      const content = fs.readFileSync(resolvedPath, "utf8")
      bundle = JSON.parse(content)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error(chalk.red(`Failed to read/parse file: ${message}`))
      process.exit(1)
    }

    const validationErrors = validateExportBundle(bundle)
    if (validationErrors.length > 0) {
      console.error(chalk.red("Invalid export bundle:"))
      for (const err of validationErrors) {
        console.error(chalk.red(`  - ${err.path}: ${err.message}`))
      }
      process.exit(1)
    }

    const timeoutMs = parseInt(globalOpts.timeout, 10)
    if (isNaN(timeoutMs) || timeoutMs < 1) {
      console.error(chalk.red(`Invalid timeout: ${globalOpts.timeout}`))
      process.exit(1)
    }

    try {
      const results = await runCollection(bundle as Parameters<typeof runCollection>[0], {
        envName: globalOpts.env,
        timeoutMs,
        requestName: options.request,
        noColor: globalOpts.color === false,
        json: globalOpts.json,
      })

      if (globalOpts.json) {
        for (const result of results) {
          console.log(JSON.stringify(result))
        }
      } else {
        printResults(results)
      }

      const passed = results.filter((r) => r.passed).length
      const failed = results.length - passed
      const totalTime = results.reduce((sum, r) => sum + r.durationMs, 0)

      if (!globalOpts.json) {
        const totalSeconds = (totalTime / 1000).toFixed(1)
        const passedStr = chalk.green(`${passed} passed`)
        const failedStr = failed > 0 ? chalk.red(`, ${failed} failed`) : ""
        console.log(`\n${passedStr}${failedStr} in ${totalSeconds}s`)
      }

      if (failed > 0) {
        process.exit(1)
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error(chalk.red(message))
      process.exit(1)
    }
  })

program
  .command("validate <file>")
  .description("Validate the format of an exported JSON file")
  .action((filePath: string) => {
    const resolvedPath = path.resolve(filePath)
    if (!fs.existsSync(resolvedPath)) {
      console.error(chalk.red(`File not found: ${resolvedPath}`))
      process.exit(1)
    }

    let bundle: unknown
    try {
      const content = fs.readFileSync(resolvedPath, "utf8")
      bundle = JSON.parse(content)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error(chalk.red(`Failed to read/parse file: ${message}`))
      process.exit(1)
    }

    const errors = validateExportBundle(bundle)
    if (errors.length === 0) {
      console.log(chalk.green("Valid export bundle"))
      process.exit(0)
    } else {
      console.error(chalk.red("Invalid export bundle:"))
      for (const err of errors) {
        console.error(chalk.red(`  - ${err.path}: ${err.message}`))
      }
      process.exit(1)
    }
  })

function printResults(results: RunResult[]): void {
  // Find column widths
  const methodWidth = Math.max(6, ...results.map((r) => r.method.length))
  const statusWidth = Math.max(3, ...results.map((r) => String(r.status).length))

  for (const result of results) {
    const icon = result.passed
      ? chalk.green("✓")
      : chalk.red("✗")

    const method = chalk.bold(padRight(result.method, methodWidth))

    const status = padLeft(String(result.status || "---"), statusWidth)
    const coloredStatus = result.passed
      ? chalk.green(status)
      : chalk.red(status)

    const time = chalk.gray(`${result.durationMs}ms`)

    if (result.error) {
      console.log(`${icon} ${method} ${result.url}    ${coloredStatus}   ${time}  ${chalk.red(result.error)}`)
    } else {
      console.log(`${icon} ${method} ${result.url}    ${coloredStatus}   ${time}`)
    }
  }
}

function padRight(str: string, width: number): string {
  return str + " ".repeat(Math.max(0, width - str.length))
}

function padLeft(str: string, width: number): string {
  return " ".repeat(Math.max(0, width - str.length)) + str
}

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  program.parse()
}

export { program }
