/**
 * `recli graphql <endpoint>` — execute a one-off GraphQL query.
 */
import { runCollection } from "../runner.js";
import { resolveOpts, emitResults, chalk } from "../utils.js";
export function registerGraphql(program) {
    program
        .command("graphql <endpoint>")
        .description("Execute a GraphQL query")
        .requiredOption("--query <query>", "GraphQL query string")
        .option("--variables <json>", "Query variables as JSON")
        .option("--operation-name <name>", "Operation name")
        .action(async (endpoint, cmdOpts) => {
        const opts = resolveOpts(program);
        if (!opts.color)
            chalk.level = 0;
        const gqlBundle = {
            version: "1.0",
            collections: [
                {
                    name: "GraphQL Query",
                    requests: [
                        {
                            name: cmdOpts.operationName || "GraphQL Query",
                            method: "GRAPHQL",
                            url: endpoint,
                            endpoint: "/graphql",
                            graphql: {
                                query: cmdOpts.query,
                                variables: cmdOpts.variables ? JSON.parse(cmdOpts.variables) : undefined,
                                operationName: cmdOpts.operationName,
                            },
                        },
                    ],
                },
            ],
        };
        const timeoutMs = parseInt(opts.timeout, 10) || 30000;
        const results = await runCollection(gqlBundle, {
            envName: opts.env,
            timeoutMs,
            noColor: !opts.color,
            reporter: opts.reporter,
        });
        await emitResults(results, opts);
        if (results.filter((r) => !r.passed).length > 0)
            process.exit(1);
    });
}
//# sourceMappingURL=graphql.js.map