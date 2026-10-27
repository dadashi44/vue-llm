---
description: 'Depure chamadas de LLM no Vue DevTools: inspecione cada useChat, useCompletion e useObject e veja requisições, tempo até o primeiro token, chamadas de ferramentas e uso de tokens em uma linha do tempo.'
---

# DevTools

O `vue-llm/devtools` adiciona uma aba **LLM** ao [Vue DevTools](https://devtools.vuejs.org). Use-a para ver o que o seu app envia ao modelo, quanto tempo o modelo leva e quantos tokens ele usa, sem `console.log`.

## Configuração {#setup}

```bash
npm i -D @vue/devtools-api
```

```ts
// main.ts
import { createApp } from 'vue'
import { LLMDevtools } from 'vue-llm/devtools'
import App from './App.vue'

const app = createApp(App)
if (import.meta.env.DEV) app.use(LLMDevtools)
app.mount('#app')
```

No **Nuxt** você não precisa disso: em desenvolvimento, o módulo instala o plugin para você quando `@vue/devtools-api` está disponível. Desative com `vueLlm: { devtools: false }`.

Funciona com a extensão do Vue DevTools para navegador, com o app standalone e com o `vite-plugin-vue-devtools`.

## Inspetor {#inspector}

A aba **LLM** lista cada `useChat`, `useCompletion` e `useObject` ativo, marcado com o status e o modelo. Selecione um para ver:

| Seção | Conteúdo |
|---------|----------|
| state | status, provedor, modelo, último erro |
| usage | requisições, erros, tokens de prompt e de completion, último tempo até o primeiro token, duração e tokens/s |
| messages | o histórico do chat, com chamadas de ferramentas, argumentos e resultados |
| output | a completion atual ou o objeto parcial |

Passe o mouse sobre uma sessão para ver as ações: **stop** para parar a geração e **clear** para limpar as mensagens.

Passe um `id` para o composable para diferenciar as sessões:

```ts
useChat({ id: 'support-chat', provider, model: 'gpt-4o' })
```

## Linha do tempo {#timeline}

Cada requisição é um grupo na linha do tempo:

```
request       openai · gpt-4o
first token   340 ms
tool: get_weather   {"city":"Oslo"}
finish        tool-calls · 910 ms · 512 tokens · 48 tok/s
```

Erros e requisições abortadas ficam destacados. Selecione um evento para ver as mensagens enviadas, os argumentos e resultados das ferramentas e o uso.

::: tip Gravação
O Vue DevTools 7+ só grava a linha do tempo de um plugin quando ela está ativada. Abra **LLM → Timeline** e clique no botão de gravação no canto superior direito.
:::

## Opções {#options}

```ts
app.use(LLMDevtools, { logMessages: false })
```

| Opção | Padrão | Descrição |
|--------|---------|-------------|
| `logMessages` | `true` | Anexa o histórico completo de mensagens aos eventos `request`. Use `false` para registrar só a contagem. |

## Custo {#cost}

Sem o plugin, os composables pulam toda a instrumentação: sem wrap do stream, sem eventos e sem objetos extras. `@vue/devtools-api` é uma peer dependency opcional e só o `vue-llm/devtools` a importa, então bundles de produção que não usam o plugin não a incluem.
