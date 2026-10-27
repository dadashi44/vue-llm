<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useChat } from '../../../../src/composables/use-chat'
import { defineTool } from '../../../../src/types'
import MessageParts from '../../../../src/components/MessageParts.vue'
import { fakeWeather, scriptedProvider } from './scripted-provider'
import WeatherCard from './WeatherCard.vue'
import BookingCard from './BookingCard.vue'

const getWeather = defineTool<{ city: string; days: number }>({
  name: 'get_weather',
  description: 'Current weather and forecast for a city',
  parameters: { type: 'object', properties: { city: { type: 'string' }, days: { type: 'number' } } },
  async execute({ city, days }, { signal }) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 900)
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason) }, { once: true })
    })
    return fakeWeather(city, days)
  },
})

// No execute: the call waits for the user in BookingCard
const confirmBooking = defineTool({
  name: 'confirm_booking',
  description: 'Ask the user to confirm a restaurant booking',
  parameters: { type: 'object', properties: { restaurant: { type: 'string' }, time: { type: 'string' }, guests: { type: 'number' } } },
})

const { messages, input, status, error, sendMessage, addToolResult, stop, setMessages } = useChat({
  provider: scriptedProvider,
  model: 'scripted',
  tools: [getWeather, confirmBooking],
})

const components = { get_weather: WeatherCard, confirm_booking: BookingCard }
const suggestions = ['What is the weather in Oslo?', 'Weather in Buenos Aires', 'Book a table for tonight']
const busy = computed(() => status.value === 'submitted' || status.value === 'streaming')
const scroller = ref<HTMLElement>()

function send(text?: string): void {
  if (busy.value) return
  void sendMessage(text)
}

watch(messages, async () => {
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight })
}, { deep: true })
</script>

<template>
  <div class="demo">
    <div ref="scroller" class="messages">
      <p v-if="!messages.length" class="empty">
        Pick a prompt below. The model is simulated, so this runs instantly, with no network.
      </p>
      <MessageParts
        v-for="message in messages"
        :key="message.id"
        :message="message"
        :components="components"
        :class="['msg', message.role]"
        @tool-result="addToolResult"
      />
    </div>

    <p v-if="error" class="error">
      {{ error.message }}
    </p>

    <div class="suggestions">
      <button v-for="s in suggestions" :key="s" :disabled="busy" @click="send(s)">
        {{ s }}
      </button>
    </div>

    <form class="composer" @submit.prevent="send()">
      <input v-model="input" placeholder="Weather in Tokyo…">
      <button v-if="busy" type="button" @click="stop">
        Stop
      </button>
      <button v-else type="submit" class="primary" :disabled="!input.trim()">
        Send
      </button>
      <button v-if="messages.length && !busy" type="button" @click="setMessages([])">
        Clear
      </button>
    </form>
  </div>
</template>

<style scoped>
.demo {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 16px;
  margin: 24px 0;
  background: var(--vp-c-bg-soft);
}

.messages {
  height: 380px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px;
}

.empty {
  margin: auto;
  max-width: 380px;
  text-align: center;
  color: var(--vp-c-text-2);
  font-size: 14px;
}

.msg {
  max-width: 85%;
  font-size: 14px;
  line-height: 1.6;
}

.msg.user {
  align-self: flex-end;
  background: var(--vp-c-brand-soft);
  border-radius: 12px;
  padding: 8px 12px;
}

.msg :deep(p) {
  margin: 0;
}

.error {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--vp-c-danger-1);
}

.suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.composer {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

input {
  flex: 1;
  min-width: 0;
  font: inherit;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 6px 10px;
}

button {
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  border-radius: 999px;
  padding: 4px 12px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.composer button {
  border-radius: 8px;
}

button.primary {
  background: var(--vp-c-brand-3);
  border-color: var(--vp-c-brand-3);
  color: var(--vp-c-white);
}
</style>
