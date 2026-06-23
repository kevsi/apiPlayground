/**
 * Minimal cURL command parser for Reqly import.
 *
 * Supports:
 *   - `-X METHOD`, `--request METHOD`
 *   - `-H "Header: value"`, `--header "Header: value"`
 *   - `-d DATA`, `--data DATA`, `--data=DATA`
 *   - `-u USER:PASS`
 *   - URL (http:// or https://)
 */

export interface ParsedCurl {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
  auth?: { type: "basic"; username: string; password: string }
}

/**
 * Tokenizes the input, respecting single- and double-quoted strings.
 * Returns an array of tokens.
 */
function tokenize(input: string): string[] {
  const tokens: string[] = []
  let i = 0
  const len = input.length

  while (i < len) {
    // Skip whitespace
    while (i < len && /\s/.test(input[i])) i++
    if (i >= len) break

    const ch = input[i]
    if (ch === '"' || ch === "'") {
      // Quoted token — consume until matching quote
      const quote = ch
      i++
      let value = ""
      while (i < len && input[i] !== quote) {
        if (input[i] === "\\" && i + 1 < len) {
          value += input[i + 1]
          i += 2
        } else {
          value += input[i]
          i++
        }
      }
      i++ // closing quote
      tokens.push(value)
    } else {
      // Unquoted token — consume until whitespace
      let value = ""
      while (i < len && !/\s/.test(input[i])) {
        value += input[i]
        i++
      }
      tokens.push(value)
    }
  }

  return tokens
}

function extractAfterEquals(token: string): string | undefined {
  const idx = token.indexOf("=")
  if (idx === -1) return undefined
  return token.slice(idx + 1)
}

export function parseCurlCommand(command: string): ParsedCurl | null {
  try {
    let cmd = command.trim()
    // Strip leading `curl`
    cmd = cmd.replace(/^curl\s+/i, "").trim()
    if (cmd.startsWith("curl")) cmd = cmd.slice(4).trim()

    const tokens = tokenize(cmd)

    let method = "GET"
    const headers: Record<string, string> = {}
    let body: string | undefined
    let auth: ParsedCurl["auth"] | undefined
    let url = ""
    let skipNext = false

    for (let i = 0; i < tokens.length; i++) {
      if (skipNext) {
        skipNext = false
        continue
      }

      const tok = tokens[i]

      if (tok === "-X" || tok === "--request") {
        const val = extractAfterEquals(tok) ?? tokens[i + 1]
        if (val) {
          method = val.toUpperCase()
          if (tok === "-X") skipNext = true
        }
        continue
      }

      if (tok === "-H" || tok === "--header") {
        const val = extractAfterEquals(tok) ?? tokens[i + 1]
        if (val) {
          const colonIdx = val.indexOf(":")
          if (colonIdx !== -1) {
            const key = val.slice(0, colonIdx).trim()
            const value = val.slice(colonIdx + 1).trim()
            headers[key] = value
          } else {
            headers[val] = ""
          }
        }
        if (tok === "-H") skipNext = true
        continue
      }

      if (tok === "-d" || tok === "--data" || tok === "--data-raw" || tok.startsWith("--data=") || tok.startsWith("-d")) {
        const val = tok.startsWith("-d") && tok.length > 2
          ? tok.slice(2)
          : tok.startsWith("--data=")
          ? tok.slice("--data=".length)
          : extractAfterEquals(tok) ?? tokens[i + 1]
        if (val !== undefined) body = val
        if (tok === "-d" || tok === "--data" || tok === "--data-raw") skipNext = true
        continue
      }

      if (tok === "-u" || tok.startsWith("-u")) {
        const val = tok.startsWith("-u") && tok.length > 2
          ? tok.slice(2)
          : tokens[i + 1]
        if (val) {
          const colonIdx = val.indexOf(":")
          auth = {
            type: "basic",
            username: val.slice(0, colonIdx),
            password: colonIdx !== -1 ? val.slice(colonIdx + 1) : "",
          }
        }
        if (tok === "-u") skipNext = true
        continue
      }

      // URL: must contain protocol and not start with a dash
      if (/^https?:\/\//i.test(tok) && !tok.startsWith("-")) {
        url = tok
        continue
      }
    }

    // No URL found
    if (!url) return null

    return { method, url, headers, body, auth }
  } catch {
    return null
  }
}

// ── Test cases (can be run manually or via a test runner) ──────────────
if (typeof window === "undefined") {
  const tests: Array<{ input: string; expected: Partial<ParsedCurl> }> = [
    {
      input: `curl -X POST https://api.example.com/users -H "Content-Type: application/json" -d '{"name":"test"}'`,
      expected: {
        method: "POST",
        url: "https://api.example.com/users",
        body: '{"name":"test"}',
      },
    },
    {
      input: `curl https://api.example.com/users`,
      expected: {
        method: "GET",
        url: "https://api.example.com/users",
      },
    },
    {
      input: `curl -u user:pass https://api.example.com/api`,
      expected: {
        method: "GET",
        url: "https://api.example.com/api",
        auth: { type: "basic", username: "user", password: "pass" },
      },
    },
  ]

  let allPassed = true
  for (const { input, expected } of tests) {
    const result = parseCurlCommand(input)
    if (!result) {
      console.error(`FAIL: parseCurlCommand returned null for: ${input}`)
      allPassed = false
      continue
    }
    if (expected.method && result.method !== expected.method) {
      console.error(`FAIL: method — got "${result.method}", want "${expected.method}"`)
      allPassed = false
    }
    if (expected.url && result.url !== expected.url) {
      console.error(`FAIL: url — got "${result.url}", want "${expected.url}"`)
      allPassed = false
    }
    if (expected.body && result.body !== expected.body) {
      console.error(`FAIL: body — got "${result.body}", want "${expected.body}"`)
      allPassed = false
    }
    if (expected.auth) {
      if (!result.auth) {
        console.error(`FAIL: auth — got undefined, want ${JSON.stringify(expected.auth)}`)
        allPassed = false
      } else if (result.auth.username !== expected.auth.username || result.auth.password !== expected.auth.password) {
        console.error(`FAIL: auth — got ${JSON.stringify(result.auth)}, want ${JSON.stringify(expected.auth)}`)
        allPassed = false
      }
    }
  }

  if (allPassed) {
    console.log("All curl-parser tests passed.")
  }
}