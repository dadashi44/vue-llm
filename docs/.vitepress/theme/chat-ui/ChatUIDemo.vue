<script setup lang="ts">
import { ref } from 'vue'
import { useChat, defineTool } from 'vue-llm'
import { Chat } from '../../../../registry/chat'
import { fakeWeather, scriptedProvider } from '../generative-ui/scripted-provider'
import './preview.css'

const getWeather = defineTool<{ city: string; days: number }>({
  name: 'get_weather',
  description: 'Current weather and forecast for a city',
  parameters: { type: 'object', properties: { city: { type: 'string' }, days: { type: 'number' } } },
  async execute({ city, days }) {
    await new Promise(r => setTimeout(r, 700))
    return fakeWeather(city, days)
  },
})

const chat = useChat({ provider: scriptedProvider, model: 'scripted', tools: [getWeather] })
const theme = ref<'neutral' | 'vue'>('neutral')
const suggestions = ['Show me a Vue composable', 'What is the weather in Oslo?']
</script>

<template>
  <div class="vp-raw chat-ui-demo">
    <div class="toolbar">
      <span>Theme</span>
      <button :class="{ active: theme === 'neutral' }" @click="theme = 'neutral'">
        Neutral
      </button>
      <button :class="{ active: theme === 'vue' }" @click="theme = 'vue'">
        Vue green
      </button>
      <button v-if="chat.messages.value.length" class="clear" @click="chat.stop(); chat.setMessages([])">
        Clear
      </button>
    </div>
    <div class="shadcn-preview frame" :data-theme="theme">
      <Chat :chat="chat" :suggestions="suggestions" placeholder="Ask about Vue…" />
    </div>
  </div>
</template>

<style scoped>
.chat-ui-demo {
  margin: 24px 0;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.toolbar button {
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 13px;
  color: var(--vp-c-text-1);
  cursor: pointer;
}

.toolbar button.active {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.toolbar .clear {
  margin-left: auto;
}

.frame {
  height: 560px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  overflow: hidden;
}
</style>
