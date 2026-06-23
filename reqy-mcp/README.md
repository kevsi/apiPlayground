# Reqly MCP Server

MCP (Model Context Protocol) server for Reqly. Exposes your Reqly collections as tools that Claude, Cursor, and other MCP-compatible clients can invoke.

## Installation

```bash
npm install -g reqly-mcp
# or
npx -y reqly-mcp
```

## Usage

### With a Reqly export file

```bash
reqly-mcp --file ./my-collection.json
```

### From stdin

```bash
cat my-collection.json | reqly-mcp
```

### Options

- `--file <path>` — Path to exported Reqly JSON bundle
- `--env <name>` — Default environment name for variable interpolation
- `--timeout <ms>` — Default request timeout in milliseconds (default: 30000)

## Claude Desktop Config

Add this to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "reqly": {
      "command": "npx",
      "args": ["-y", "reqly-mcp", "--file", "/path/to/your/reqly-export.json"]
    }
  }
}
```

## Cursor Config

Add to your Cursor MCP settings (`.cursor/mcp.json` in your project or user settings):

```json
{
  "mcpServers": {
    "reqly": {
      "command": "npx",
      "args": ["-y", "reqly-mcp", "--file", "/path/to/your/reqly-export.json"]
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `list_collections` | List all collections with request counts |
| `list_requests` | List requests in a collection |
| `get_request` | Get details of a specific request |
| `run_request` | Execute a request and return status + body + timing |
| `create_request` | Create a new request in a collection |
| `search_requests` | Search requests by name, URL, or method |

## Exporting from Reqly

In the Reqly app, export your collections to a JSON file. The expected format is:

```json
{
  "version": "1.0",
  "exportedAt": "2024-01-01T00:00:00Z",
  "collections": [...],
  "environments": [...]
}
```

## Development

```bash
pnpm install
pnpm run dev
pnpm run build
pnpm run test
```
