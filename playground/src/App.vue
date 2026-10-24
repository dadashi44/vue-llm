<script setup lang="ts">
import { ref, computed } from 'vue'
import { useChat } from 'vue-llm'
import { createOpenAI, createAnthropic, createOllama } from 'vue-llm/providers'

const providerType = ref<'openai' | 'anthropic' | 'ollama'>('openai')
const apiKey = ref('')
const modelId = ref('gpt-4o')
const systemPrompt = ref('')

const providerModels = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250414', 'claude-opus-4-20250514'],
  ollama: ['llama3', 'mistral', 'codellama', 'phi3'],
}

const availableModels = computed(() => providerModels[providerType.value])

function createProvider() {
  switch (providerType.value) {
    case 'openai':
      return createOpenAI({ apiKey: apiKey.value, dangerouslyAllowBrowser: true })
    case 'anthropic':
      return createAnthropic({ apiKey: apiKey.value, dangerouslyAllowBrowser: true })
    case 'ollama':
      return createOllama()
  }
}

const provider = computed(() => createProvider())

const { messages, input, status, error, isLoading, sendMessage, stop, clearError, setMessages } = useChat({
  provider: provider.value,
  model: modelId.value,
  system: systemPrompt.value || undefined,
  onFinish: (msg, ctx) => {
    console.log('[vue-llm] finish', ctx.finishReason, msg)
  },
  onError: (err) => {
    console.error('[vue-llm] error', err)
  },
})

function handleSend() {
  if (!input.value.trim()) return
  sendMessage()
}

function handleClear() {
  setMessages([])
  clearError()
}

function getPartText(part: { type: string; text?: string; toolName?: string; state?: string }) {
  if (part.type === 'text') return part.text ?? ''
  if (part.type === 'reasoning') return `💭 ${part.text}`
  if (part.type === 'tool-call') return `🔧 ${part.toolName} (${part.state})`
  return ''
}
</script>

<template>
  <div class="app">
    <header>
      <h1>vue-llm playground</h1>
      <p class="subtitle">Test AI chat composables in the browser</p>
    </header>

    <div class="config">
      <div class="config-row">
        <label>
          Provider
          <select v-model="providerType" @change="modelId = availableModels[0]">
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="ollama">Ollama (local)</option>
          </select>
        </label>

        <label v-if="providerType !== 'ollama'">
          API Key
          <input v-model="apiKey" type="password" placeholder="sk-... or sk-ant-..." />
        </label>

        <label>
          Model
          <select v-model="modelId">
            <option v-for="m in availableModels" :key="m" :value="m">{{ m }}</option>
          </select>
        </label>
      </div>

      <label class="full-width">
        System prompt
        <input v-model="systemPrompt" placeholder="You are a helpful assistant..." />
      </label>
    </div>

    <div class="chat">
      <div v-if="messages.length === 0" class="empty">
        No messages yet. Type something below.
      </div>

      <div v-for="msg in messages" :key="msg.id" class="message" :class="msg.role">
        <div class="role">{{ msg.role }}</div>
        <div class="content">
          <template v-for="(part, i) in msg.parts" :key="i">
            <span
              :class="{ streaming: part.state === 'streaming', reasoning: part.type === 'reasoning' }"
            >{{ getPartText(part) }}</span>
          </template>
          <span v-if="msg.role === 'assistant' && status === 'streaming'" class="cursor">▊</span>
        </div>
      </div>

      <div v-if="error" class="error">
        {{ error.message }}
        <button @click="clearError">Dismiss</button>
      </div>
    </div>

    <div class="input-bar">
      <input
        v-model="input"
        placeholder="Type a message..."
        :disabled="isLoading"
        @keydown.enter.exact="handleSend"
      />
      <button v-if="isLoading" @click="stop" class="stop-btn">Stop</button>
      <button v-else @click="handleSend" :disabled="!input.trim()">Send</button>
      <button @click="handleClear" class="clear-btn" :disabled="messages.length === 0">Clear</button>
    </div>

    <footer>
      <span class="status" :class="status">{{ status }}</span>
      <span>{{ messages.length }} messages</span>
    </footer>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0a0a0a;
  color: #e5e5e5;
  min-height: 100vh;
}

.app {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

header {
  margin-bottom: 20px;
}

h1 {
  font-size: 24px;
  font-weight: 700;
  color: #fff;
}

.subtitle {
  color: #888;
  font-size: 14px;
  margin-top: 4px;
}

.config {
  background: #141414;
  border: 1px solid #262626;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.config-row {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.config label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #888;
  flex: 1;
}

.config label.full-width {
  margin-top: 4px;
}

.config select,
.config input {
  background: #0a0a0a;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 8px 12px;
  color: #e5e5e5;
  font-size: 14px;
}

.config select:focus,
.config input:focus {
  outline: none;
  border-color: #4ade80;
}

.chat {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty {
  text-align: center;
  color: #555;
  padding: 48px 0;
}

.message {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.message .role {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.message.user .role { color: #60a5fa; }
.message.assistant .role { color: #4ade80; }

.message .content {
  background: #141414;
  border: 1px solid #262626;
  border-radius: 12px;
  padding: 12px 16px;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.message.user .content {
  background: #1a1a2e;
  border-color: #2a2a4e;
}

.reasoning {
  color: #a78bfa;
  font-style: italic;
}

.cursor {
  animation: blink 1s step-end infinite;
  color: #4ade80;
}

@keyframes blink {
  50% { opacity: 0; }
}

.error {
  background: #2d1111;
  border: 1px solid #5c2020;
  border-radius: 12px;
  padding: 12px 16px;
  color: #fca5a5;
  font-size: 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.error button {
  background: #5c2020;
  border: none;
  color: #fca5a5;
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}

.input-bar {
  display: flex;
  gap: 8px;
}

.input-bar input {
  flex: 1;
  background: #141414;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 12px 16px;
  color: #e5e5e5;
  font-size: 14px;
}

.input-bar input:focus {
  outline: none;
  border-color: #4ade80;
}

.input-bar button {
  background: #4ade80;
  color: #0a0a0a;
  border: none;
  border-radius: 12px;
  padding: 12px 20px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
}

.input-bar button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.stop-btn {
  background: #ef4444 !important;
  color: #fff !important;
}

.clear-btn {
  background: #333 !important;
  color: #888 !important;
}

footer {
  display: flex;
  justify-content: space-between;
  margin-top: 12px;
  font-size: 12px;
  color: #555;
}

.status {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status.ready { color: #4ade80; }
.status.submitted { color: #facc15; }
.status.streaming { color: #60a5fa; }
.status.error { color: #ef4444; }

@media (max-width: 600px) {
  .config-row {
    flex-direction: column;
  }
}
</style>
