import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleMCPCallback, openAuthPopup, waitForMCPCallback } from '../../src/mcp/callback.js'
import type { MCPCallbackMessage } from '../../src/mcp/callback.js'

const TYPE = 'vue-llm:mcp-callback'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  history.replaceState(null, '', '/')
})

describe('handleMCPCallback', () => {
  it('posts code and state to the opener with its own origin', () => {
    history.replaceState(null, '', '/mcp/callback?code=abc&state=xyz')
    const postMessage = vi.fn()
    const close = vi.fn()
    vi.stubGlobal('opener', { postMessage })
    vi.spyOn(window, 'close').mockImplementation(close)
    const msg = handleMCPCallback()
    expect(msg).toEqual({ type: TYPE, state: 'xyz', code: 'abc' })
    expect(postMessage).toHaveBeenCalledWith({ type: TYPE, state: 'xyz', code: 'abc' }, location.origin)
    expect(close).toHaveBeenCalled()
  })

  it('also posts on the BroadcastChannel', async () => {
    history.replaceState(null, '', '/cb?error=access_denied&error_description=no&state=s1')
    vi.stubGlobal('opener', null)
    vi.spyOn(window, 'close').mockImplementation(() => {})
    const ch = new BroadcastChannel('vue-llm:mcp')
    const got = new Promise<unknown>((r) => (ch.onmessage = (e) => r(e.data)))
    handleMCPCallback()
    expect(await got).toEqual({ type: TYPE, state: 's1', error: 'access_denied', errorDescription: 'no' })
    ch.close()
  })

  it('returns undefined and does nothing outside a callback URL', () => {
    history.replaceState(null, '', '/somewhere?x=1')
    const postMessage = vi.fn()
    const close = vi.fn()
    vi.stubGlobal('opener', { postMessage })
    vi.spyOn(window, 'close').mockImplementation(close)
    expect(handleMCPCallback()).toBeUndefined()
    expect(postMessage).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
  })
})

describe('openAuthPopup', () => {
  it('opens a named popup', () => {
    const open = vi.fn(() => null)
    vi.stubGlobal('open', open)
    openAuthPopup()
    expect(open).toHaveBeenCalledWith('about:blank', 'vue-llm-mcp-auth', 'popup,width=600,height=720')
  })
})

describe('waitForMCPCallback', () => {
  const post = (data: unknown, origin = location.origin) =>
    window.dispatchEvent(new MessageEvent('message', { data, origin }))

  it('ignores messages from another origin', async () => {
    const p = waitForMCPCallback(() => true)
    post({ type: TYPE, state: 'a' }, 'https://evil.example')
    post({ type: TYPE, state: 'b', code: 'c' })
    expect(await p).toMatchObject({ state: 'b' })
  })

  it('ignores a message with another state', async () => {
    const p = waitForMCPCallback((m: MCPCallbackMessage) => m.state === 'mine')
    post({ type: TYPE, state: 'other' })
    post({ type: 'unrelated' })
    post({ type: TYPE, state: 'mine', code: 'c' })
    expect(await p).toMatchObject({ state: 'mine', code: 'c' })
  })

  it('resolves from the BroadcastChannel', async () => {
    const p = waitForMCPCallback((m) => m.state === 's')
    const ch = new BroadcastChannel('vue-llm:mcp')
    ch.postMessage({ type: TYPE, state: 's', code: 'k' })
    expect(await p).toMatchObject({ code: 'k' })
    ch.close()
  })

  it('rejects when the popup is closed', async () => {
    vi.useFakeTimers()
    const popup = { closed: false } as { closed: boolean }
    const p = waitForMCPCallback(() => true, { popup: popup as Window })
    const assertion = expect(p).rejects.toMatchObject({ name: 'MCPAuthError', code: 'popup_closed' })
    await vi.advanceTimersByTimeAsync(600)
    popup.closed = true
    await vi.advanceTimersByTimeAsync(500) // first seen closed
    await vi.advanceTimersByTimeAsync(500) // grace tick
    await assertion
  })

  it('still resolves if the message arrives during the grace tick', async () => {
    vi.useFakeTimers()
    const popup = { closed: true } as Window
    const p = waitForMCPCallback(() => true, { popup })
    await vi.advanceTimersByTimeAsync(500)
    post({ type: TYPE, state: 'late' })
    expect(await p).toMatchObject({ state: 'late' })
  })

  it('rejects on abort', async () => {
    const ac = new AbortController()
    const p = waitForMCPCallback(() => true, { signal: ac.signal })
    ac.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    const ac2 = new AbortController()
    ac2.abort('why')
    await expect(waitForMCPCallback(() => true, { signal: ac2.signal })).rejects.toBe('why')
  })
})
