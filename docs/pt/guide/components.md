---
description: 'MessageParts e StreamMarkdown: componentes Vue que renderizam mensagens de LLM em streaming, Markdown seguro, raciocínio e chamadas de ferramentas.'
---

# Componentes

```ts
import { MessageParts, StreamMarkdown } from 'vue-llm/components'
import 'vue-llm/style.css' // cursor animation and small layout defaults
```

O módulo Nuxt registra os dois componentes e a folha de estilos para você.

Para uma interface de chat completa e estilizada, veja [Chat UI](./chat-ui).

::: info
Os componentes exigem Vue 3. No Vue 2.7, use `renderMarkdown` com `v-html` — é TypeScript puro.
:::

## MessageParts

Renderiza uma mensagem inteira: texto em Markdown, raciocínio recolhível, imagens, fontes e chamadas de ferramentas por meio dos seus próprios componentes. Veja [Generative UI](./generative-ui).

```vue
<MessageParts
  v-for="msg in messages"
  :key="msg.id"
  :message="msg"
  :components="{ get_weather: WeatherCard }"
  @tool-result="addToolResult"
/>
```

| Prop / evento | Descrição |
|------|-------------|
| `message` | Um `UIMessage` |
| `components` | Nome da ferramenta → componente. Ele recebe `ToolComponentProps` |
| `render` | Renderizador de Markdown customizado, como no `StreamMarkdown` |
| `@tool-result` | Disparado com `{ toolCallId, result }` quando um componente de ferramenta chama `addResult` |
| Slot `#tool` | Fallback para ferramentas sem componente: `{ part, addResult }` |

O elemento raiz tem `class="vue-llm-message"` e `data-role` com o papel da mensagem. As partes usam as classes `vue-llm-text`, `vue-llm-reasoning`, `vue-llm-file` e `vue-llm-source`, para que você possa estilizá-las.

## StreamMarkdown

Renderiza o Markdown do modelo enquanto ele chega via streaming, com um cursor piscando.

```vue
<script setup lang="ts">
const { messages, status } = useChat({ provider: ai, model: 'gpt-4o' })
</script>

<template>
  <div v-for="msg in messages" :key="msg.id">
    <template v-for="(part, i) in msg.parts" :key="i">
      <StreamMarkdown
        v-if="part.type === 'text'"
        :content="part.text"
        :streaming="part.state === 'streaming'"
      />
    </template>
  </div>
</template>
```

| Prop | Tipo | Descrição |
|------|------|-------------|
| `content` | `string` | Fonte em Markdown |
| `streaming` | `boolean` | Mostra o cursor |
| `render` | `(markdown: string) => string` | Substitui o renderizador nativo |

O renderizador nativo não tem dependências e suporta títulos, parágrafos, negrito/itálico/tachado, código inline, blocos de código cercados (classe `language-*` para highlighters), listas, citações, tabelas, linhas horizontais, links e imagens. Um bloco de código não fechado é renderizado como código, então trechos que ainda estão chegando aparecem corretamente.

### Segurança {#security}

A saída do modelo não é confiável. O renderizador nativo:

- escapa todo o texto, então HTML bruto como `<script>` ou `<img onerror>` aparece como texto e nunca é interpretado;
- permite apenas URLs `http(s):`, `mailto:` e relativas em links e imagens, e descarta `javascript:`, `data:`, URLs relativas ao protocolo e outras;
- abre links com `target="_blank" rel="noopener noreferrer"`.

Uma função `render` customizada **não** é sanitizada pelo vue-llm. Se você usar uma biblioteca de Markdown completa, sanitize a saída dela:

```ts
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const render = (md: string) => DOMPurify.sanitize(marked.parse(md) as string)
```

```vue
<StreamMarkdown :content="text" :render="render" />
```

O renderizador também é exportado para uso fora do componente:

```ts
import { renderMarkdown } from 'vue-llm/components'

const html = renderMarkdown('**Hello**') // '<p><strong>Hello</strong></p>'
```
