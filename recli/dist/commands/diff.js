/**
 * `recli diff <before> <after>` — compare two result JSON files.
 *
 * Matching is done by request name (not index) so reordering requests in a
 * collection does not produce false positives.
 */
import chalk from "chalk";
import { loadResultsFile, simpleBodyDiff } from "../utils.js";
export function registerDiff(program) {
    program
        .command("diff <before> <after>")
        .description("Compare two result JSON files")
        .action((beforeFile, afterFile) => {
        const before = loadResultsFile(beforeFile);
        const after = loadResultsFile(afterFile);
        const diffs = computeDiff(before, after);
        printDiff(diffs);
        if (diffs.some((d) => d.statusChanged || d.bodyChanged))
            process.exit(1);
    });
}
function computeDiff(before, after) {
    const afterByName = new Map();
    for (const r of after) {
        // If duplicate names exist, keep the first occurrence
        if (!afterByName.has(r.name))
            afterByName.set(r.name, r);
    }
    const diffs = [];
    const seen = new Set();
    // Walk through "before" and match by name
    for (const b of before) {
        seen.add(b.name);
        const a = afterByName.get(b.name);
        if (!a) {
            diffs.push({
                name: b.name,
                url: b.url,
                statusChanged: true,
                oldStatus: b.status,
                newStatus: 0,
                bodyChanged: true,
                oldDuration: b.durationMs,
                newDuration: 0,
                durationChanged: true,
                passedBefore: b.passed,
                passedAfter: false,
            });
            continue;
        }
        const statusChanged = b.status !== a.status;
        const bodyChanged = b.body !== a.body;
        const durationChanged = Math.abs(b.durationMs - a.durationMs) > 100;
        diffs.push({
            name: a.name,
            url: a.url,
            statusChanged,
            oldStatus: b.status,
            newStatus: a.status,
            bodyChanged,
            bodyDiff: bodyChanged ? simpleBodyDiff(b.body, a.body) : undefined,
            durationChanged,
            oldDuration: b.durationMs,
            newDuration: a.durationMs,
            passedBefore: b.passed,
            passedAfter: a.passed,
        });
    }
    // Handle "after" entries not in "before"
    for (const a of after) {
        if (!seen.has(a.name)) {
            diffs.push({
                name: a.name,
                url: a.url,
                statusChanged: true,
                oldStatus: 0,
                newStatus: a.status,
                bodyChanged: true,
                oldDuration: 0,
                newDuration: a.durationMs,
                durationChanged: true,
                passedBefore: false,
                passedAfter: a.passed,
            });
        }
    }
    return diffs;
}
function printDiff(diffs) {
    console.log(chalk.bold(`\nDiff Report (${diffs.length} requests)`));
    let changes = 0;
    for (const d of diffs) {
        const hasChanges = d.statusChanged || d.bodyChanged || d.durationChanged;
        if (hasChanges)
            changes++;
        const icon = hasChanges ? chalk.yellow("~") : chalk.green("=");
        console.log(`\n${icon} ${chalk.bold(d.name)}`);
        console.log(`   ${d.url}`);
        if (d.statusChanged)
            console.log(`   ${chalk.yellow("status:")} ${d.oldStatus} → ${d.newStatus}`);
        else
            console.log(`   ${chalk.green("status:")} ${d.newStatus} (unchanged)`);
        if (d.bodyChanged)
            console.log(`   ${chalk.yellow("body:")}   ${d.bodyDiff || "changed"}`);
        if (d.durationChanged)
            console.log(`   ${chalk.yellow("time:")}  ${d.oldDuration}ms → ${d.newDuration}ms`);
        if (d.passedBefore !== d.passedAfter) {
            console.log(`   ${chalk.yellow("result:")} ${d.passedBefore ? "pass" : "fail"} → ${d.passedAfter ? "pass" : "fail"}`);
        }
    }
    console.log(chalk.bold(`\n${changes} changed, ${diffs.length - changes} unchanged`));
}
//# sourceMappingURL=diff.js.map