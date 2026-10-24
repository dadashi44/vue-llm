import { describe, it, expect } from 'vitest'
import { SSEParserStream } from '../../src/core/sse-parser'

async function parseSSE(input: string) {
  const stream = new ReadableStream<string>({
    start(controller) {
      controller.enqueue(input)
      controller.close()
    },
  })

  const events: { event?: string; data: string }[] = []
  const reader = stream.pipeThrough(new SSEParserStream()).getReader()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    events.push(value)
  }

  return events
}

describe('SSEParserStream', () => {
  it('parses a single data event', async () => {
    const events = await parseSSE('data: hello world\n\n')
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe('hello world')
  })

  it('parses multiple events', async () => {
    const events = await parseSSE('data: first\n\ndata: second\n\n')
    expect(events).toHaveLength(2)
    expect(events[0].data).toBe('first')
    expect(events[1].data).toBe('second')
  })

  it('parses event type', async () => {
    const events = await parseSSE('event: message\ndata: hello\n\n')
    expect(events[0].event).toBe('message')
    expect(events[0].data).toBe('hello')
  })

  it('parses multi-line data', async () => {
    const events = await parseSSE('data: line1\ndata: line2\n\n')
    expect(events[0].data).toBe('line1\nline2')
  })

  it('ignores comment lines', async () => {
    const events = await parseSSE(': this is a comment\ndata: actual\n\n')
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe('actual')
  })

  it('parses JSON data', async () => {
    const json = JSON.stringify({ text: 'hello' })
    const events = await parseSSE(`data: ${json}\n\n`)
    expect(JSON.parse(events[0].data)).toEqual({ text: 'hello' })
  })

  it('handles [DONE] marker', async () => {
    const events = await parseSSE('data: {"text":"hi"}\n\ndata: [DONE]\n\n')
    expect(events).toHaveLength(2)
    expect(events[1].data).toBe('[DONE]')
  })

  it('handles chunked input', async () => {
    const chunks = ['data: hel', 'lo\n\ndata: wor', 'ld\n\n']
    const stream = new ReadableStream<string>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk)
        controller.close()
      },
    })

    const events: { data: string }[] = []
    const reader = stream.pipeThrough(new SSEParserStream()).getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      events.push(value)
    }

    expect(events).toHaveLength(2)
    expect(events[0].data).toBe('hello')
    expect(events[1].data).toBe('world')
  })
})
