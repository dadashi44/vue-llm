/**
 * Encryption at rest for server-mode MCP credentials: AES-GCM with a key derived as
 * SHA-256(secret), a fresh 12-byte IV per value, stored as base64url(iv ‖ ciphertext).
 */

const IV_BYTES = 12
const keys = new Map<string, Promise<CryptoKey>>()

function key(secret: string): Promise<CryptoKey> {
  let k = keys.get(secret)
  if (!k) {
    k = crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(secret))
      .then(raw => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']))
    keys.set(secret, k)
  }
  return k
}

function toBase64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function encryptValue(secret: string, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(secret), new TextEncoder().encode(plaintext))
  const out = new Uint8Array(IV_BYTES + ciphertext.byteLength)
  out.set(iv)
  out.set(new Uint8Array(ciphertext), IV_BYTES)
  return toBase64url(out)
}

/** Throws when the payload is malformed or was encrypted with another secret */
export async function decryptValue(secret: string, payload: string): Promise<string> {
  const bytes = fromBase64url(payload)
  if (bytes.length <= IV_BYTES) throw new Error('Encrypted value is too short')
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.subarray(0, IV_BYTES) },
    await key(secret),
    bytes.subarray(IV_BYTES),
  )
  return new TextDecoder().decode(plaintext)
}
