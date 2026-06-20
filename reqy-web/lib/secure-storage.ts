"use client"

/**
 * Secure-ish ephemeral storage for API keys and tokens.
 *
 * Uses AES-256-GCM encryption via the Web Crypto API with a key derived
 * from a passphrase (PBKDF2, 600k iterations). Both the passphrase and
 * the encrypted payload live in localStorage so values survive page
 * refreshes and cross-tab navigation.
 *
 * Security note: this is NOT suitable for high-value secrets — both the
 * passphrase and ciphertext are in the same storage. The encryption
 * prevents casual reading from memory dumps or devtools, not targeted
 * offline attacks.
 */

const STORAGE_PREFIX = "reqly-secure-"
const PASSPHRASE_KEY = "reqly-crypto-passphrase"
const SALT_KEY = "reqly-crypto-salt"

// ---- Storage helpers (IndexedDB via persistence layer) -----------------

import { persistence } from "@/lib/persistence"

function storeGet(key: string): string | null {
  try {
    const val = persistence.getItem<string>(key)
    return val ?? null
  } catch { return null }
}

async function storeSet(key: string, value: string): Promise<void> {
  try { await persistence.setItem(key, value) } catch { /* storage unavailable */ }
}

async function storeRemove(key: string): Promise<void> {
  try { await persistence.removeItem(key) } catch { /* ignore */ }
}

// ---- Crypto helpers ---------------------------------------------------

function getOrCreatePassphrase(): string {
  const existing = storeGet(PASSPHRASE_KEY)
  if (existing) return existing
  const passphrase = crypto.randomUUID()
  storeSet(PASSPHRASE_KEY, passphrase)
  return passphrase
}

function getOrCreateSalt(): Uint8Array {
  const existing = storeGet(SALT_KEY)
  if (existing) {
    try {
      return Uint8Array.from(atob(existing), (c) => c.charCodeAt(0))
    } catch { /* corrupted — regenerate */ }
  }
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const encoded = btoa(salt.reduce((acc, b) => acc + String.fromCharCode(b), ""))
  storeSet(SALT_KEY, encoded)
  return salt
}

let cachedKey: CryptoKey | null = null
let keyPromise: Promise<CryptoKey> | null = null

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey
  if (!keyPromise) {
    keyPromise = deriveKey(getOrCreatePassphrase())
  }
  cachedKey = await keyPromise
  return cachedKey
}

async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  )
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: getOrCreateSalt(),
      iterations: 600000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

async function encryptValue(plaintext: string, key: CryptoKey): Promise<string> {
  const encoder = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext),
  )
  const cipherBytes = new Uint8Array(encrypted)
  const combined = new Uint8Array(iv.length + cipherBytes.length)
  combined.set(iv)
  combined.set(cipherBytes)
  const binary = combined.reduce((acc, byte) => acc + String.fromCharCode(byte), "")
  return btoa(binary)
}

async function decryptValue(ciphertext: string, key: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const data = combined.slice(12)
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  )
  return new TextDecoder().decode(decrypted)
}

// ---- Store -------------------------------------------------------------

class EphemeralStore {
  private syncStore = new Map<string, string>()
  private ready = false
  private readyResolve: (() => void) | null = null
  private initPromise: Promise<void>

  constructor() {
    this.initPromise = new Promise<void>((resolve) => {
      this.readyResolve = resolve
    })
    this.initialize()
  }

  private async initialize(): Promise<void> {
    try {
      const key = await getKey()
      // Walk persistence keys for encrypted entries (IndexedDB + fallback localStorage)
      const allKeys = persistence.keys()
      for (const k of allKeys) {
        if (k.startsWith(STORAGE_PREFIX)) {
          try {
            const encrypted = persistence.getItem<string>(k)
            if (encrypted) {
              const plain = await decryptValue(encrypted, key)
              this.syncStore.set(k.substring(STORAGE_PREFIX.length), plain)
            }
          } catch {
            // entry corrupted or key mismatch — skip
          }
        }
      }
      this.ready = true
    } catch {
      // crypto unavailable — store remains empty but operational
      this.ready = true
    }
    this.readyResolve?.()
  }

  /** Await the initial decryption pass before first read. */
  async waitForReady(): Promise<void> {
    await this.initPromise
  }

  set(key: string, value: string): void {
    this.syncStore.set(key, value)
    getKey()
      .then((k) => encryptValue(value, k))
      .then(async (encrypted) => {
        await storeSet(STORAGE_PREFIX + key, encrypted)
      })
      .catch(() => {
        // silently fail
      })
  }

  get(key: string): string | undefined {
    return this.syncStore.get(key)
  }

  delete(key: string): void {
    this.syncStore.delete(key)
    storeRemove(STORAGE_PREFIX + key)
  }

  clear(): void {
    this.syncStore.clear()
    const prefixedKeys = persistence.keys().filter((k) => k.startsWith(STORAGE_PREFIX))
    for (const k of prefixedKeys) {
      persistence.removeItem(k)
    }
  }
}

export const secureKeys = new EphemeralStore()
