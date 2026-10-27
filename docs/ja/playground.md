---
description: 'vue-llm の useChat で構築した、WebGPU 上でブラウザー内だけで動く LLM とチャットできます。API キーもサーバーも不要です。'
title: プレイグラウンド
---

<TokenStreamHero title="プレイグラウンド" />

**ブラウザー内** の WebGPU でモデルを動かす、本物の `useChat` です。API キーもサーバーも不要で、入力した内容がこのタブの外に出ることはありません。モデルのダウンロードは一度だけで、以降の訪問ではブラウザーのキャッシュが使われます。

<ClientOnly>
  <WebLLMPlayground />
</ClientOnly>

## 仕組み {#how-it-works}

このプレイグラウンドは、ライブラリの公開 API だけで作られた短いコンポーネントです。

```ts
import { CreateWebWorkerMLCEngine } from '@mlc-ai/web-llm'
import { useChat } from 'vue-llm'
import { createWebLLM } from 'vue-llm/providers'

const ai = createWebLLM({
  createEngine: (model, engineConfig, chatOptions) => CreateWebWorkerMLCEngine(
    new Worker(new URL('./webllm.worker.ts', import.meta.url), { type: 'module' }),
    model, engineConfig, chatOptions,
  ),
  onProgress: ({ progress, text }) => { /* drive a progress bar */ },
})

const model = ref('SmolLM2-360M-Instruct-q4f16_1-MLC')
const { messages, input, handleSubmit, stop } = useChat({ provider: ai, model })
```

`createWebLLM` を `createOpenAI`、`createAnthropic`、または独自のバックエンドに置き換えても、コンポーネントはそのまま使えます。詳しくは [ブラウザ内モデル](./guide/in-browser) のガイドを参照してください。
