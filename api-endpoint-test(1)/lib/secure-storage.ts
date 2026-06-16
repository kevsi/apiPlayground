"use client"

const STORAGE_PREFIX = "reqly-secure-"
const PASSPHRASE_KEY = "reqly-crypto-passphrase"
const SALT_KEY = "reqly-crypto-salt"

function getOrCreatePassphrase(): string {
  try {
    const existing = sessionStorage.getItem(PASSPHRASE_KEY)
    if (existing) return existing
  } catch {
    // sessionStorage unavailable
  }
  const passphrase = crypto.randomUUID()
  try {
    sessionStorage.setItem(PASSPHRASE_KEY, passphrase)
  } catch {
    // ignore
  }
  return passphrase
}

function getOrCreateSalt(): Uint8Array {
  try {
    const existing = sessionStorage.getItem(SALT_KEY)
    if (existing) {
      const decoded = atob(existing)
      return Uint8Array.from(decoded, (c) => c.charCodeAt(0))
    }
  } catch {
    // sessionStorage unavailable
  }
  const salt = crypto.getRandomValues(new Uint8Array(16))
  try {
    const encoded = btoa(salt.reduce((acc, b) => acc + String.fromCharCode(b), ""))
    sessionStorage.setItem(SALT_KEY, encoded)
  } catch {
    // ignore
  }
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

class EphemeralStore {
  private syncStore = new Map<string, string>()
  private ready = false
  private initPromise: Promise<void> | null = null

  constructor() {
    this.initPromise = this.initialize()
  }

  private async initialize(): Promise<void> {
    try {
      const key = await getKey()
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i)
        if (k?.startsWith(STORAGE_PREFIX)) {
          try {
            const encrypted = sessionStorage.getItem(k)
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
      // crypto unavailable
    }
  }

  set(key: string, value: string): void {
    this.syncStore.set(key, value)
    getKey()
      .then((k) => encryptValue(value, k))
      .then((encrypted) => {
        try {
          sessionStorage.setItem(STORAGE_PREFIX + key, encrypted)
        } catch {
          // storage full or unavailable
        }
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
    try {
      sessionStorage.removeItem(STORAGE_PREFIX + key)
    } catch {
      // silently fail
    }
  }

  clear(): void {
    this.syncStore.clear()
    try {
      const keys: string[] = []
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i)
        if (k?.startsWith(STORAGE_PREFIX)) {
          keys.push(k)
        }
      }
      for (const k of keys) {
        sessionStorage.removeItem(k)
      }
    } catch {
      // silently fail
    }
  }
}

export const secureKeys = new EphemeralStore()
