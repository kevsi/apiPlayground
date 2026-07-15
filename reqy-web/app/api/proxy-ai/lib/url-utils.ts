import { isIP } from "node:net";
import { isBlockedIp } from "@/lib/security/ssrf";

export function getCustomUrl(body: Record<string, unknown>): string {
  const raw = typeof body.openaiUrl === "string" ? body.openaiUrl.trim() : "";
  if (!raw) {
    throw new Error("Custom provider requires a base URL");
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid custom provider URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("URL must use http or https");
  }
  if (
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "0.0.0.0" ||
    (isIP(parsed.hostname) && isBlockedIp(parsed.hostname))
  ) {
    throw new Error("Custom provider URL cannot point to localhost or private IP");
  }
  return raw.replace(/\/+$/, "") + "/chat/completions";
}

export function isOllamaHostAllowed(host: string): boolean {
  const lower = host.toLowerCase();
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(lower)) return false;
  if (isIP(lower) && isBlockedIp(lower)) return false;
  return true;
}
