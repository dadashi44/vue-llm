export class LLMAPIError extends Error {
  readonly status: number
  readonly provider: string
  readonly body: string
  readonly retryAfter?: number

  constructor(options: { message: string; status: number; provider: string; body: string; retryAfter?: number }) {
    super(options.message)
    this.name = 'LLMAPIError'
    this.status = options.status
    this.provider = options.provider
    this.body = options.body
    this.retryAfter = options.retryAfter
  }

  get isRetryable(): boolean {
    return this.status === 408 || this.status === 409 || this.status === 429 || this.status >= 500
  }
}

export async function createAPIError(provider: string, label: string, response: Response): Promise<LLMAPIError> {
  const body = await response.text()
  return new LLMAPIError({
    message: `[vue-llm] ${label} error ${response.status}: ${body}`,
    status: response.status,
    provider,
    body,
    retryAfter: parseRetryAfter(response.headers),
  })
}

export function parseRetryAfter(headers: Headers | undefined): number | undefined {
  if (!headers) return undefined

  const ms = headers.get('retry-after-ms')
  if (ms && !Number.isNaN(Number(ms))) return Number(ms)

  const value = headers.get('retry-after')
  if (!value) return undefined

  const seconds = Number(value)
  if (!Number.isNaN(seconds)) return seconds * 1000

  const date = Date.parse(value)
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
}
