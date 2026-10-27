---
description: 'Uma UI de chat de IA pronta para Vue: adicione componentes shadcn-vue com um comando e fique dono do código, ou monte a sua com os composables headless usePromptInput e useAutoScroll.'
---

# Chat UI

Uma interface de chat completa que é **sua**. Os componentes são adicionados ao seu projeto pela CLI do shadcn-vue como arquivos `.vue` comuns, então você pode mudar o estilo ou reescrevê-los como qualquer outro componente. O comportamento que é fácil de errar vem no pacote `vue-llm` e é atualizado junto com ele.

<ClientOnly>
  <ChatUIDemo />
</ClientOnly>

A demo usa um modelo roteirizado. Os componentes são os mesmos que a CLI instala.

## Como está dividido {#how-it-is-split}

| Parte | Onde fica | Atualizações |
|------|----------------|---------|
| `useChat`, provedores, `StreamMarkdown` | pacote `vue-llm` | `npm update vue-llm` |
| `usePromptInput`, `useAutoScroll` | pacote `vue-llm` | `npm update vue-llm` |
| `Chat`, `ChatMessage`, `ChatPromptInput`, `ChatReasoning`, `ChatToolCall` | copiados para o seu projeto | código seu; rode `add` de novo para puxar as mudanças do upstream |

## Instalação {#install}

Você precisa de um projeto [shadcn-vue](https://www.shadcn-vue.com/docs/installation), ou seja, com Tailwind CSS e `lib/utils.ts`.

```bash
npx shadcn-vue@latest add https://dadashi44.github.io/vue-llm/r/chat.json
```

A CLI instala o `vue-llm` e a sua biblioteca de ícones (Lucide por padrão; outras bibliotecas de ícones são mapeadas pela CLI) e grava os componentes em `components/ui/chat/`.

## Uso {#usage}

```vue
<script setup lang="ts">
import { useChat } from 'vue-llm'
import { createSSEProvider } from 'vue-llm/providers'
import { Chat } from '@/components/ui/chat'

const chat = useChat({
  provider: createSSEProvider({ url: '/api/chat' }),
  model: 'gpt-4o',
})
</script>

<template>
  <div class="h-dvh">
    <Chat :chat="chat" :suggestions="['Summarize this page', 'Write a haiku']" />
  </div>
</template>
```

O `Chat` ocupa todo o elemento pai, então defina uma altura para o pai.

### Generative UI

Passe componentes para as suas ferramentas. Ferramentas sem componente usam o `ChatToolCall`, um card recolhível com os argumentos e o resultado.

```vue
<Chat :chat="chat" :components="{ get_weather: WeatherCard, confirm_booking: BookingCard }" />
```

Veja [Generative UI](./generative-ui) para saber como escrever componentes de ferramenta.

## Componentes {#components}

### Chat

O chat completo: lista de mensagens com auto-scroll, estado vazio com sugestões, indicador de digitação, erro com opção de tentar de novo, um botão para rolar até o fim e o campo de entrada.

| Prop | Tipo | Descrição |
|------|------|-------------|
| `chat` | `UseChatReturn` | O valor retornado pelo `useChat` |
| `components` | `Record<string, Component>` | Nome da ferramenta → componente |
| `suggestions` | `string[]` | Prompts exibidos enquanto o chat está vazio |
| `placeholder` | `string` | Placeholder do campo de entrada |
| `accept` | `string \| false` | Anexos aceitos; `false` esconde o botão de anexar |

O slot `#empty` substitui o título do estado vazio.

### ChatMessage

Uma mensagem: Markdown, raciocínio, chamadas de ferramentas, imagens e arquivos, fontes, e ações de copiar e regenerar. Emite `tool-result` e `regenerate`.

### ChatPromptInput

Uma textarea que cresce sozinha, com anexos (seletor de arquivos, colar e arrastar e soltar) e botões de enviar e parar. Recebe `chat`, `placeholder`, `accept` e `maxFiles`.

### ChatReasoning

Raciocínio recolhível. Abre enquanto o modelo pensa e se recolhe quando a resposta começa.

### ChatToolCall

O card de fallback para chamadas de ferramentas, com o estado e os argumentos e o resultado recolhíveis.

## Temas {#theming}

Os componentes usam apenas os tokens de tema do shadcn: `background`, `foreground`, `primary`, `muted`, `border`, `ring`, `card` e `destructive`. Eles seguem o seu tema e o dark mode. Experimente o **Vue green** na demo acima.

## Sem Tailwind {#without-tailwind}

Não use o registry. Monte a UI com os composables headless, que concentram as partes difíceis dos componentes acima:

```vue
<script setup lang="ts">
import { useAutoScroll, useChat, usePromptInput } from 'vue-llm'

const chat = useChat({ provider, model: 'gpt-4o' })
const { input, messages } = chat
const prompt = usePromptInput(chat)
const { files, canSubmit, submit, removeFile, handlers, dropzone } = prompt
const scroll = useAutoScroll()
const { isAtBottom, scrollToBottom } = scroll
</script>

<template>
  <div :ref="scroll.container" class="messages">
    <MyMessage v-for="m in messages" :key="m.id" :message="m" />
  </div>
  <button v-if="!isAtBottom" @click="scrollToBottom('smooth')">↓</button>

  <form v-bind="dropzone" @submit.prevent="submit">
    <span v-for="f in files" :key="f.name">{{ f.name }} <button type="button" @click="removeFile(f)">×</button></span>
    <textarea :ref="prompt.textarea" v-model="input" rows="1" v-bind="handlers" />
    <button :disabled="!canSubmit">Send</button>
  </form>
</template>
```

Faça o bind dos template refs com `:ref="scroll.container"` em vez de desestruturar `container`. O `vue-tsc` com `noUnusedLocals`, que os templates do Vite habilitam, não conta uma string `ref="container"` como uso.

### usePromptInput(chat, options?)

- **Enter** envia e **Shift+Enter** adiciona uma nova linha. O Enter que confirma uma composição de IME (chinês, japonês, coreano) nunca envia.
- A textarea cresce com o conteúdo até `maxRows` (padrão `8`).
- Arquivos são anexados por `addFiles` (inputs de arquivo), ao colar e ao arrastar e soltar no elemento `dropzone`. `isDragging` permite mostrar um overlay de drop.
- `accept` e `maxFiles` filtram os anexos, e `onReject(files, reason)` informa os rejeitados.
- `submit()` envia o texto e os arquivos e limpa os dois. `canSubmit` fica false enquanto o chat está ocupado.

No Vue 2.7, faça o bind dos handlers explicitamente (`@keydown="handlers.onKeydown" @paste="handlers.onPaste"`), porque lá o `v-bind` não adiciona listeners.

### useAutoScroll(options?)

- Mantém a lista grudada no fim enquanto as mensagens chegam via streaming e enquanto imagens ou blocos de código crescem.
- Para de acompanhar quando o usuário rola para cima, para que ele possa ler. `isAtBottom` vira `false`.
- `scrollToBottom('smooth')` gruda no fim de novo.
- `threshold` (padrão `48` px) define o quão perto do fim ainda conta como "no fim".
