<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useStrings } from './strings'

defineProps<{ title: string }>()

const strings = useStrings()

const POOL = ['useChat', ' The', ' AI', ' SDK', '{"city":', '"Oslo"}', 'tool-call', 'reasoning', ' 19°C', 'stream', 'ref()', 'WebGPU', 'Ollama', 'Claude', 'Gemini', 'gpt-4o', 'onToolCall', 'text-delta', 'finish', '<Chat />', 'Llama 3.2', 'computed', 'Nuxt', 'addToolResult', ' partly', ' cloudy', 'Generative UI', 'tok/s', 'DevTools', 'useObject', 'shadcn-vue', 'SSE']
const HOT = new Set(['useChat', 'tool-call', 'Generative UI', '<Chat />', 'WebGPU', 'DevTools'])

const lanes = Array.from({ length: 7 }, (_, i) => {
  const tokens = Array.from({ length: 14 }, (_, k) => {
    const text = POOL[(i * 7 + k * 5) % POOL.length]
    return { text, hot: HOT.has(text) && (i + k) % 3 === 0 }
  })
  return {
    // Doubled so the lane loops seamlessly at -50%
    tokens: [...tokens, ...tokens],
    duration: `${38 + ((i * 13) % 5) * 9}s`,
    reverse: i % 2 === 1,
    opacity: 0.35 + ((i * 3) % 4) * 0.15,
  }
})

// Typewriter over the localized phrases
const phraseIndex = ref(0)
const typed = ref(0)
const reduced = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

const phrase = computed(() => strings.value.phrases[phraseIndex.value % strings.value.phrases.length])
const shown = computed(() => (reduced.value ? phrase.value : phrase.value.slice(0, typed.value)))

function step(deleting = false): void {
  const full = Array.from(phrase.value).length
  if (!deleting && typed.value < full) {
    typed.value++
    timer = setTimeout(() => step(false), 38)
  } else if (!deleting) {
    timer = setTimeout(() => step(true), 2000)
  } else if (typed.value > 0) {
    typed.value--
    timer = setTimeout(() => step(true), 18)
  } else {
    phraseIndex.value++
    timer = setTimeout(() => step(false), 250)
  }
}

onMounted(() => {
  reduced.value = matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!reduced.value) step()
})

watch(() => strings.value, () => {
  typed.value = 0
  phraseIndex.value = 0
})

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="vp-raw token-hero">
    <div class="lanes" aria-hidden="true">
      <div
        v-for="(lane, i) in lanes"
        :key="i"
        :class="['lane', { reverse: lane.reverse }]"
        :style="{ animationDuration: lane.duration, opacity: lane.opacity }"
      >
        <span v-for="(token, k) in lane.tokens" :key="k" :class="['token', { hot: token.hot }]">{{ token.text }}</span>
      </div>
    </div>
    <div class="veil" aria-hidden="true" />
    <div class="content">
      <h1>{{ title }}</h1>
      <p class="typing">
        {{ shown }}<span class="caret" aria-hidden="true">▍</span>
      </p>
    </div>
  </div>
</template>

<style scoped>
.token-hero {
  position: relative;
  height: 280px;
  margin: 0 0 32px;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-alt);
}

.lanes {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
}

.lane {
  display: flex;
  gap: 10px;
  width: max-content;
  animation: marquee linear infinite;
}

.lane.reverse {
  animation-direction: reverse;
}

.token {
  flex-shrink: 0;
  padding: 5px 11px;
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  white-space: pre;
}

.token.hot {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 45%, transparent);
  background: color-mix(in srgb, var(--vp-c-brand-1) 12%, transparent);
  color: var(--vp-c-brand-1);
}

.veil {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 48% 52% at 50% 50%, var(--vp-c-bg-alt) 40%, transparent 85%);
}

.content {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 0 24px;
  text-align: center;
}

h1 {
  margin: 0;
  font-size: 44px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.03em;
  color: var(--vp-c-text-1);
}

.typing {
  min-height: 1.6em;
  margin: 0;
  font-family: var(--vp-font-family-mono);
  font-size: 16px;
  color: var(--vp-c-text-2);
}

.caret {
  color: var(--vp-c-brand-1);
  animation: blink 1s step-end infinite;
}

@keyframes marquee { to { transform: translateX(-50%); } }
@keyframes blink { 50% { opacity: 0; } }

@media (prefers-reduced-motion: reduce) {
  .lane, .caret { animation: none; }
}

@media (max-width: 640px) {
  .token-hero { height: 220px; }
  h1 { font-size: 32px; }
  .typing { font-size: 14px; }
}
</style>
