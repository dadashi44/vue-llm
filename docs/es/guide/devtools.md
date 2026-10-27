---
description: 'Depura las llamadas al LLM en Vue DevTools: inspecciona cada useChat, useCompletion y useObject, y consulta en una línea de tiempo las peticiones, el tiempo hasta el primer token, las llamadas a herramientas y el consumo de tokens.'
---

# DevTools

`vue-llm/devtools` añade una pestaña **LLM** a [Vue DevTools](https://devtools.vuejs.org). Úsala para ver qué envía tu app al modelo, cuánto tarda el modelo y cuántos tokens usa, sin `console.log`.

## Configuración {#setup}

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

En **Nuxt** no lo necesitas: en desarrollo, el módulo instala el plugin por ti cuando `@vue/devtools-api` está disponible. Desactívalo con `vueLlm: { devtools: false }`.

Funciona con la extensión de navegador de Vue DevTools, la app independiente y `vite-plugin-vue-devtools`.

## Inspector

La pestaña **LLM** lista cada `useChat`, `useCompletion` y `useObject` activo, etiquetado con su estado y su modelo. Selecciona uno para ver:

| Sección | Contenido |
|---------|----------|
| state | estado, proveedor, modelo, último error |
| usage | peticiones, errores, tokens de prompt y de completado, último tiempo hasta el primer token, duración y tokens/s |
| messages | el historial del chat, con llamadas a herramientas, argumentos y resultados |
| output | el completado actual o el objeto parcial |

Pasa el cursor sobre una sesión para ver las acciones: **stop** para detener la generación y **clear** para borrar los mensajes.

Pasa `id` a un composable para distinguir las sesiones:

```ts
useChat({ id: 'support-chat', provider, model: 'gpt-4o' })
```

## Línea de tiempo {#timeline}

Cada petición es un grupo en la línea de tiempo:

```
request       openai · gpt-4o
first token   340 ms
tool: get_weather   {"city":"Oslo"}
finish        tool-calls · 910 ms · 512 tokens · 48 tok/s
```

Los errores y las peticiones canceladas se resaltan. Selecciona un evento para ver los mensajes enviados, los argumentos y resultados de las herramientas y el consumo.

::: tip Grabación
Vue DevTools 7+ solo graba la línea de tiempo de un plugin cuando está activada. Abre **LLM → Timeline** y pulsa el interruptor de grabación en la esquina superior derecha.
:::

## Opciones {#options}

```ts
app.use(LLMDevtools, { logMessages: false })
```

| Opción | Por defecto | Descripción |
|--------|---------|-------------|
| `logMessages` | `true` | Adjunta el historial completo de mensajes a los eventos `request`. Ponlo a `false` para registrar solo el número de mensajes. |

## Coste {#cost}

Sin el plugin, los composables se saltan toda la instrumentación: no envuelven el stream, no emiten eventos ni crean objetos extra. `@vue/devtools-api` es una peer dependency opcional y solo la importa `vue-llm/devtools`, así que los bundles de producción que no usan el plugin no la incluyen.
