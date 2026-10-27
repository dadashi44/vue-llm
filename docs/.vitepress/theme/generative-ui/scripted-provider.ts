import type { ChatMessage, ChatStreamChunk, LLMProvider } from '../../../../src/providers/types'

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => {
    clearTimeout(timer)
    reject(new DOMException('Aborted', 'AbortError'))
  }, { once: true })
})

type Step = { chunk: ChatStreamChunk; delay?: number }

const text = (value: string): Step[] =>
  value.split(/(?<= )/).map(word => ({ chunk: { type: 'text-delta', text: word }, delay: 35 }))

let callCount = 0

function toolCall(name: string, args: Record<string, unknown>): Step[] {
  const id = `call_${++callCount}`
  const json = JSON.stringify(args)
  const pieces = json.match(/.{1,4}/g) ?? []
  return [
    { chunk: { type: 'tool-call-start', toolCallId: id, toolName: name }, delay: 150 },
    ...pieces.map(args => ({ chunk: { type: 'tool-call-delta' as const, toolCallId: id, args }, delay: 45 })),
    { chunk: { type: 'tool-call-end', toolCallId: id } },
    { chunk: { type: 'finish', finishReason: 'tool-calls' } },
  ]
}

function contentOf(message: ChatMessage | undefined): string {
  if (!message) return ''
  return typeof message.content === 'string' ? message.content : message.content.map(p => (p.type === 'text' ? p.text : '')).join('')
}

function plan(messages: ChatMessage[]): Step[] {
  const last = messages[messages.length - 1]

  if (last?.role === 'tool') {
    const result = JSON.parse(contentOf(last)) as Record<string, unknown>
    if ('temp' in result) {
      return text(`It's ${result.temp}°C and ${String(result.condition).toLowerCase()} in ${result.city}. `
        + `The next days stay around ${(result.forecast as { temp: number }[]).map(d => d.temp).join(', ')}°C.`)
    }
    if (result.confirmed) return text(`Done — your table at ${result.restaurant} is booked for ${result.time}. Enjoy!`)
    return text('No problem, I have not booked anything. Want me to look for another time?')
  }

  const prompt = contentOf(last).toLowerCase()
  const city = /weather in ([\p{L} ]+)/u.exec(prompt)?.[1]?.trim()
  if (city) {
    return [
      ...text('Let me check that for you.'),
      ...toolCall('get_weather', { city: city.replace(/\b\p{L}/gu, c => c.toUpperCase()), days: 3 }),
    ]
  }
  if (prompt.includes('book')) {
    return [
      ...text('I found a table. Please confirm the booking:'),
      ...toolCall('confirm_booking', { restaurant: 'Trattoria Vue', time: '19:30', guests: 4 }),
    ]
  }
  return text('This demo uses a scripted model, so try one of the suggestions above.')
}

/** A fake model that streams prepared answers, so the demo needs no API key or download */
export const scriptedProvider: LLMProvider = {
  id: 'scripted',
  supportsStreaming: true,
  validateConfig() {},
  async chat({ messages, signal }) {
    const steps = plan(messages)
    const hasFinish = steps.some(s => s.chunk.type === 'finish')
    if (!hasFinish) steps.push({ chunk: { type: 'finish', finishReason: 'stop' } })

    const stream = new ReadableStream<ChatStreamChunk>({
      async start(controller) {
        try {
          await sleep(300, signal)
          for (const step of steps) {
            if (step.delay) await sleep(step.delay, signal)
            controller.enqueue(step.chunk)
          }
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
    })
    return { stream, response: Promise.resolve({ finishReason: 'stop' }) }
  },
}

/** Deterministic fake weather, so the demo looks the same on every run */
export function fakeWeather(city: string, days: number) {
  const seed = [...city].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  const conditions = ['Sunny', 'Partly cloudy', 'Cloudy', 'Light rain']
  const temp = (seed % 22) + 2
  return {
    city,
    temp,
    condition: conditions[seed % conditions.length],
    forecast: Array.from({ length: days }, (_, i) => ({
      day: ['Tomorrow', 'In 2 days', 'In 3 days', 'In 4 days'][i] ?? `Day ${i + 1}`,
      temp: temp + ((seed + i * 3) % 7) - 3,
    })),
  }
}
