---
description: '1 つの LLMProvider インターフェースを通じて、useChat を OpenAI、Anthropic Claude、Google Gemini、Ollama、ブラウザ内 WebGPU モデル、または独自のバックエンドに接続します。'
---

# プロバイダー

すべてのプロバイダーは同じ `LLMProvider` インターフェースを実装しているため、コンポーザブル、ミドルウェア、サーバーハンドラーはどのプロバイダーとも組み合わせて使えます。

## OpenAI

```ts
import { createOpenAI } from 'vue-llm/providers'

const ai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: 'https://api.openai.com/v1/chat/completions', // optional, full endpoint URL
})
```

OpenAI 互換のエンドポイント（Azure、Groq、OpenRouter、LM Studio など）であれば、`baseURL` を指定して利用できます。

## Anthropic

```ts
import { createAnthropic } from 'vue-llm/providers'

const ai = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

useChat({ provider: ai, model: 'claude-sonnet-4-5', providerOptions: { maxTokens: 8192 } })
```

`maxTokens` のデフォルトは `4096` です。Extended thinking の差分は `reasoning` パーツとしてストリーミングされます。

## Google Gemini

```ts
import { createGoogle } from 'vue-llm/providers'

const ai = createGoogle({ apiKey: process.env.GOOGLE_API_KEY! })

useChat({ provider: ai, model: 'gemini-2.5-flash' })
```

## Ollama

```ts
import { createOllama } from 'vue-llm/providers'

const ai = createOllama() // http://localhost:11434 by default
const remote = createOllama({ baseURL: 'http://gpu-box:11434' })
```

Ollama は API キーが不要で、ブラウザーから直接利用できます。

## ブラウザー内（WebGPU） {#in-the-browser-webgpu}

```ts
import { CreateMLCEngine } from '@mlc-ai/web-llm'
import { createWebLLM } from 'vue-llm/providers'

const ai = createWebLLM({ createEngine: CreateMLCEngine })

useChat({ provider: ai, model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC' })
```

モデルはユーザーの GPU 上で動作し、API キーもサーバーも必要ありません。詳しくは [ブラウザ内モデル](./in-browser) を参照してください。

## 独自のバックエンド {#your-own-backend}

`createSSEProvider` は Server-Sent Events をストリーミングする任意のサーバーに接続し、そのイベント形式を vue-llm のチャンクに変換します。詳しくは [カスタムバックエンド](./custom-backends) を参照してください。

## オプション {#options}

| オプション | プロバイダー | 説明 |
|--------|-----------|-------------|
| `apiKey` | OpenAI, Anthropic, Google | 必須 |
| `baseURL` | すべて | API エンドポイントを上書きする |
| `dangerouslyAllowBrowser` | OpenAI, Anthropic, Google | ブラウザーでの使用を許可する |

## カスタムプロバイダー {#custom-providers}

`LLMProvider` を実装すれば、ストリーミングできるものなら何でも接続できます。

```ts
import type { LLMProvider } from 'vue-llm'

const echo: LLMProvider = {
  id: 'echo',
  supportsStreaming: true,
  validateConfig() {},
  async chat({ messages }) {
    const last = messages.at(-1)
    const text = typeof last?.content === 'string' ? last.content : ''
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'text-delta', text })
        controller.enqueue({ type: 'finish', finishReason: 'stop' })
        controller.close()
      },
    })
    return { stream, response: Promise.resolve({ finishReason: 'stop' }) }
  },
}
```

ストリームは `ChatStreamChunk` を出力します。種類は `text-delta`、`reasoning-delta`、`tool-call-start`、`tool-call-delta`、`tool-call-end`、`tool-result`、`finish`、`error` です。

## エラー {#errors}

HTTP エラーは `status`、`provider`、`body`、`retryAfter`、`isRetryable` を持つ `LLMAPIError` としてスローされます。詳しくは [リトライとレート制限](./retries-rate-limiting) を参照してください。
