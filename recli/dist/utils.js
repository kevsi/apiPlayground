/**
 * Shared CLI utilities.
 *
 * - `toCurl` / `countRequests`: small helpers used by the export command.
 * - `resolveOpts` / `ResolvedOpts`: merges Commander.js options with values
 *   from the project config (recli.config.* / .reclirc).
 * - `emitResults`: dispatches results to the configured reporter (cli, json,
 *   junit, html) and writes to disk when --output is set.
 * - `loadResultsFile`: reads NDJSON or JSON result files for the diff command.
 * - `simpleBodyDiff`: short diff summary for the diff command.
 */
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { loadConfig } from "./config.js";
import { reportCLI, reportJSON, buildJUnit, buildHTML, writeReport, printSummary, printError, } from "./reporters.js";
export function toCurl(req) {
    let curl = `curl -X ${req.method} "${req.url}"`;
    if (req.headers) {
        for (const [k, v] of Object.entries(req.headers)) {
            curl += ` \\\n  -H "${k}: ${v}"`;
        }
    }
    if (req.body) {
        curl += ` \\\n  -d '${req.body.replace(/'/g, "'\\''")}'`;
    }
    return curl;
}
export function countRequests(bundle) {
    return bundle.collections.reduce((sum, c) => sum + c.requests.length, 0);
}
export function resolveOpts(prog) {
    const cli = prog.opts();
    const cfg = loadConfig();
    return {
        env: cli.env || cfg.env,
        timeout: cli.timeout || String(cfg.timeout || "30000"),
        color: cli.color !== false,
        json: !!cli.json || cfg.reporter === "json",
        parallel: !!cli.parallel || !!cfg.parallel,
        delay: parseInt(cli.delay || String(cfg.delay || "0"), 10),
        iterations: parseInt(cli.iterations || String(cfg.iterations || "1"), 10),
        data: cli.data || cfg.data,
        reporter: cli.reporter || cfg.reporter || "cli",
        output: cli.output || cfg.output,
        snapshot: !!cli.snapshot || !!cfg.snapshot,
        // Commander camelCase: --update-snapshots becomes updateSnapshots in opts
        updateSnapshots: !!cli.updateSnapshots || !!cfg.updateSnapshots,
        dotenv: cli.dotenv || cfg.dotenv,
    };
}
export async function emitResults(results, opts) {
    const reporter = opts.reporter || (opts.json ? "json" : "cli");
    const outputPath = opts.output;
    switch (reporter) {
        case "json": {
            const out = reportJSON(results);
            if (outputPath)
                writeReport(out, outputPath);
            else
                console.log(out);
            break;
        }
        case "junit": {
            const out = buildJUnit(results);
            if (outputPath)
                writeReport(out, outputPath);
            else
                writeReport(out, `recli-report-${Date.now()}.xml`);
            break;
        }
        case "html": {
            const out = buildHTML(results);
            if (outputPath)
                writeReport(out, outputPath);
            else
                writeReport(out, `recli-report-${Date.now()}.html`);
            break;
        }
        default: {
            reportCLI(results);
            break;
        }
    }
    printSummary(results, reporter === "json");
}
export function loadResultsFile(fp) {
    const resolvedPath = path.resolve(fp);
    if (!fs.existsSync(resolvedPath)) {
        printError(`File not found: ${resolvedPath}`);
        process.exit(1);
    }
    const content = fs.readFileSync(resolvedPath, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    if (lines.length === 1 && lines[0].startsWith("["))
        return JSON.parse(content);
    return lines.map((l) => JSON.parse(l));
}
export function simpleBodyDiff(before, after) {
    if (!before && !after)
        return "";
    if (!before)
        return "(new)";
    if (!after)
        return "(removed)";
    return before.length !== after.length
        ? `${before.length} → ${after.length} bytes`
        : "content changed";
}
/**
 * Reads a JSON file from disk, exiting the process on parse errors.
 * Used by commands that consume ExportBundle files.
 */
export function readBundleOrExit(filePath) {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
        printError(`File not found: ${resolvedPath}`);
        process.exit(1);
    }
    try {
        return JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
    }
    catch (e) {
        printError(`Failed to parse: ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
    }
}
/** Expose chalk via utils so command files don't need to import it directly. */
export { chalk };
//# sourceMappingURL=utils.js.map