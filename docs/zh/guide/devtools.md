---
description: '在 Vue DevTools 中调试 LLM 调用：检查每个 useChat、useCompletion 和 useObject，并在时间线上查看请求、首 token 时间、工具调用和 token 用量。'
---

# DevTools

`vue-llm/devtools` 会在 [Vue DevTools](https://devtools.vuejs.org) 中添加一个 **LLM** 标签页。无需 `console.log`，即可查看你的应用向模型发送了什么、模型耗时多久以及用了多少 token。

## 安装配置 {#setup}

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

在 **Nuxt** 中无需这样做：在开发环境下，只要 `@vue/devtools-api` 可用，模块就会自动为你安装该插件。可以通过 `vueLlm: { devtools: false }` 禁用。

支持 Vue DevTools 浏览器扩展、独立应用以及 `vite-plugin-vue-devtools`。

## 检查器 {#inspector}

**LLM** 标签页会列出所有活跃的 `useChat`、`useCompletion` 和 `useObject`，并标注其状态和模型。选中其中一个即可查看：

| 区块 | 内容 |
|---------|----------|
| state | 状态、提供方、模型、最近一次错误 |
| usage | 请求数、错误数、提示词与补全 token 数、最近一次首 token 时间、耗时以及 tokens/s |
| messages | 聊天历史记录，包括工具调用、参数和结果 |
| output | 当前的补全结果或部分对象 |

将鼠标悬停在某个会话上可以执行操作：**stop** 停止生成，**clear** 清空消息。

为组合式函数传入 `id` 以区分不同的会话：

```ts
useChat({ id: 'support-chat', provider, model: 'gpt-4o' })
```

## 时间线 {#timeline}

每个请求在时间线上都是一个分组：

```
request       openai · gpt-4o
first token   340 ms
tool: get_weather   {"city":"Oslo"}
finish        tool-calls · 910 ms · 512 tokens · 48 tok/s
```

错误和被中止的请求会被高亮显示。选中某个事件即可查看发送的消息、工具参数和结果以及用量。

::: tip 录制
Vue DevTools 7+ 只有在开启录制后才会记录插件的时间线。打开 **LLM → Timeline**，然后点击右上角的录制开关。
:::

## 选项 {#options}

```ts
app.use(LLMDevtools, { logMessages: false })
```

| 选项 | 默认值 | 说明 |
|--------|---------|-------------|
| `logMessages` | `true` | 将完整的消息历史附加到 `request` 事件上。设为 `false` 则只记录数量。 |

## 开销 {#cost}

不使用该插件时，组合式函数会跳过所有埋点：不包装流、不产生事件，也不创建额外的对象。`@vue/devtools-api` 是一个可选的 peer 依赖，并且只有 `vue-llm/devtools` 会导入它，因此未使用该插件的生产构建不会包含它。
