import { MCPAuthError } from './errors.js'

const MESSAGE_TYPE = 'vue-llm:mcp-callback'
const CHANNEL = 'vue-llm:mcp'
const POLL_MS = 500

/** The message the OAuth callback page sends back to the page that opened the popup */
export interface MCPCallbackMessage {
  type: 'vue-llm:mcp-callback'
  state?: string
  code?: string
  error?: string
  errorDescription?: string
  id?: string
  ok?: boolean
}

/**
 * Run on the OAuth callback page. If the URL carries an authorization response,
 * posts it to the opener and the `BroadcastChannel`, then closes the window.
 */
export function handleMCPCallback(): MCPCallbackMessage | undefined {
  if (typeof window === 'undefined') return undefined
  const params = new URLSearchParams(location.search)
  if (!params.has('state') && !params.has('error')) return undefined
  const msg: MCPCallbackMessage = { type: MESSAGE_TYPE }
  const state = params.get('state')
  const code = params.get('code')
  const error = params.get('error')
  const description = params.get('error_description')
  if (state !== null) msg.state = state
  if (code !== null) msg.code = code
  if (error !== null) msg.error = error
  if (description !== null) msg.errorDescription = description
  try {
    window.opener?.postMessage(msg, location.origin)
  } catch {
    // opener may be gone or cross-origin
  }
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(CHANNEL)
    channel.postMessage(msg)
    channel.close()
  }
  window.close()
  return msg
}

/** Opens the (blank) auth popup; must be called synchronously from a user gesture */
export function openAuthPopup(): Window | null {
  return window.open('about:blank', 'vue-llm-mcp-auth', 'popup,width=600,height=720')
}

/** Resolves with the first same-origin callback message accepted by `match` */
export function waitForMCPCallback(
  match: (m: MCPCallbackMessage) => boolean,
  o: { popup?: Window | null; signal?: AbortSignal } = {},
): Promise<MCPCallbackMessage> {
  return new Promise((resolve, reject) => {
    let channel: BroadcastChannel | undefined
    let timer: ReturnType<typeof setInterval> | undefined
    let closedSeen = false

    const cleanup = () => {
      window.removeEventListener('message', onMessage)
      channel?.close()
      if (timer !== undefined) clearInterval(timer)
      o.signal?.removeEventListener('abort', onAbort)
    }
    const accept = (data: unknown) => {
      const m = data as MCPCallbackMessage | null | undefined
      if (m?.type !== MESSAGE_TYPE || !match(m)) return
      cleanup()
      resolve(m)
    }
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin) return
      accept(e.data)
    }
    const onAbort = () => {
      cleanup()
      reject(o.signal!.reason ?? new MCPAuthError('aborted'))
    }

    if (o.signal?.aborted) {
      reject(o.signal.reason ?? new MCPAuthError('aborted'))
      return
    }
    o.signal?.addEventListener('abort', onAbort)
    window.addEventListener('message', onMessage)
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL)
      channel.onmessage = (e) => accept(e.data)
    }
    if (o.popup) {
      const popup = o.popup
      timer = setInterval(() => {
        if (!popup.closed) return
        // the channel message can land just after the window closes: allow one more tick
        if (!closedSeen) {
          closedSeen = true
          return
        }
        cleanup()
        reject(new MCPAuthError('popup_closed', 'The sign-in window was closed'))
      }, POLL_MS)
    }
  })
}
