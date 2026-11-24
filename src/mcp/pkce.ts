function base64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Cryptographically random base64url string from `bytes` random bytes */
export function randomString(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

/** PKCE verifier and its S256 challenge (RFC 7636) */
export async function createPKCE(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomString(32)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return { verifier, challenge: base64url(new Uint8Array(digest)) }
}
