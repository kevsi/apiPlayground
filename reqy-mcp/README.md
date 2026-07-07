# reqly-mcp

MCP server for Reqly — exposes Reqly collections to AI agents (Claude, Cursor, etc.) over the Model Context Protocol.

## Install & build

```bash
pnpm install
pnpm --dir reqy-mcp build
```

The compiled entry point is `dist/index.js`.

## Usage

### Stdio transport (default)

```bash
reqly-mcp --file /path/to/reqly-bundle.json --env dev
```

Options:

| Flag | Description |
|---|---|
| `--file <path>` | Path to an exported Reqly JSON bundle |
| `--port <number>` | Port for HTTP transport (default: stdio) |
| `--env <name>` | Default environment name for variable interpolation |
| `--timeout <ms>` | Default request timeout in milliseconds (default: 30000) |
| `--allow-local-hosts` | Allow requests to private/local addresses (SSRF disabled) |
| `--max-response-size <bytes>` | Maximum response body size in bytes (default: 10 MB) |
| `--cors-origins <origins>` | Comma-separated allowed CORS origins (HTTP mode) |

### HTTP transport

```bash
reqly-mcp --file bundle.json --port 3001 --cors-origins http://localhost:3000
```

## Tools (42 total)

### Collection management

| Tool | Description |
|---|---|
| `list_collections` | List all collections with request counts |
| `create_collection` | Create a new collection |
| `update_collection` | Rename or restyle a collection |
| `delete_collection` | Delete a collection and its requests |
| `duplicate_collection` | Duplicate a collection with all requests and folders |
| `get_collection_tree` | Get the full tree (folders + requests) of a collection |

### Request management

| Tool | Description |
|---|---|
| `list_requests` | List requests in a collection |
| `get_request` | Get full details of a request |
| `create_request` | Create a new request in a collection |
| `update_request` | Update request fields |
| `delete_request` | Delete a request |
| `duplicate_request` | Duplicate a request |
| `move_request` | Move a request to another collection/folder |
| `reorder_requests` | Reorder requests by providing the full ordered list |
| `search_requests` | Search by name, URL, or method |

### Execution

| Tool | Description |
|---|---|
| `run_request` | Execute a stored request |
| `run_collection` | Execute all requests in a collection sequentially |
| `run_collection_with_assertions` | Run a collection and evaluate assertions (returns test report) |
| `run_requests_batch` | Run multiple requests in parallel |
| `graphql_execute` | Execute an ad-hoc GraphQL query |

### Assertions & history

| Tool | Description |
|---|---|
| `get_request_history` | Get execution history for a specific request |
| `get_run_history` | Get collection run history |
| `validate_request` | Pre-flight validation without sending the request |

### Folder management

| Tool | Description |
|---|---|
| `create_folder` | Create a folder inside a collection |
| `update_folder` | Rename or move a folder |
| `delete_folder` | Delete a folder (requests inside are unlinked) |

### Environment management

| Tool | Description |
|---|---|
| `list_environments` | List all environments |
| `create_environment` | Create a new environment |
| `update_environment` | Add, modify, or remove variables |
| `delete_environment` | Delete an environment |
| `duplicate_environment` | Duplicate an environment with its variables |
| `resolve_variables` | Resolve `{{variable}}` placeholders against an environment |
| `get_environment_variables` | Get resolved variables for an environment |

### Import / Export

| Tool | Description |
|---|---|
| `export_bundle` | Export everything as a JSON bundle |
| `import_bundle` | Import from a JSON bundle |
| `import_from_curl` | Import a request from a `curl` command string |
| `export_request_to_curl` | Export a request to a `curl` command string |
| `import_from_openapi` | Import from an OpenAPI 3 JSON or YAML spec |
| `export_to_openapi` | Export all collections to OpenAPI 3 JSON |
| `export_collection_to_junit` | Export the last run record as JUnit XML |

### AI-assisted

| Tool | Description |
|---|---|
| `generate_request_from_description` | Generate a request definition from a plain-text description |
| `analyze_project_routes` | Detect HTTP routes in a local project folder (desktop mode) |

## Security

- **SSRF protection**: by default, requests to private/local addresses (RFC 1918, loopback, link-local, cloud metadata, multicast) are blocked. Pass `--allow-local-hosts` to disable.
- **Response size cap**: 10 MB by default. Override with `--max-response-size`.
- **Timeout**: 30 s by default. Override with `--timeout`.

## Development

```bash
pnpm --dir reqy-mcp dev      # tsx watch mode
pnpm --dir reqy-mcp test     # vitest
pnpm --dir reqy-mcp build    # tsc → dist/
```
