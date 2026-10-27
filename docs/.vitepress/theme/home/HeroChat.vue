<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

// A scripted replay of a useChat conversation with a tool call; times are ms within one loop
const CYCLE = 10500
const PROMPT = 'What\'s the weather in Oslo?'
const ARGS = '{"city":"Oslo","days":3}'
const FIRST = 'Let me check that for you.'
const FINAL = 'It\'s 19°C and partly cloudy in Oslo. The next three days stay between 16 and 22°C.'
// Shown without motion: the finished conversation
const STILL = 9000

const t = ref(STILL)
const root = ref<HTMLElement>()
let start = 0
let timer: ReturnType<typeof setInterval> | undefined
let observer: IntersectionObserver | undefined

const words = (text: string, from: number, step: number): string => {
  if (t.value < from) return ''
  const parts = text.split(/(?<= )/)
  return parts.slice(0, Math.floor((t.value - from) / step) + 1).join('')
}

const typed = computed(() => Math.max(0, Math.min(PROMPT.length, Math.floor((t.value - 300) / 45))))
const sent = computed(() => t.value >= 1700)
const toolState = computed(() => (t.value < 3700 ? 'Preparing' : t.value < 4700 ? 'Running' : 'Done'))
const first = computed(() => words(FIRST, 2300, 70))
const final = computed(() => words(FINAL, 5000, 55))
const args = computed(() => ARGS.slice(0, Math.max(1, Math.floor((t.value - 2900) / 30))))

function play(): void {
  if (timer) return
  start = Date.now() - t.value
  timer = setInterval(() => {
    t.value = (Date.now() - start) % CYCLE
  }, 50)
}

function pause(): void {
  clearInterval(timer)
  timer = undefined
}

onMounted(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  t.value = 0
  // Only animate while the hero is on screen
  observer = new IntersectionObserver(([entry]) => (entry.isIntersecting ? play() : pause()))
  if (root.value) observer.observe(root.value)
})

onBeforeUnmount(() => {
  pause()
  observer?.disconnect()
})
</script>

<template>
  <div ref="root" class="hero-chat" role="img" aria-label="A vue-llm chat calling a weather tool and streaming the answer">
    <div class="bar" aria-hidden="true">
      <span class="light" style="background: #ff5f57" />
      <span class="light" style="background: #febc2e" />
      <span class="light" style="background: #28c840" />
      <span class="title">useChat({ tools: [getWeather] })</span>
    </div>

    <div class="body" aria-hidden="true">
      <div v-if="sent" class="user rise">
        {{ PROMPT }}
      </div>
      <div v-if="t >= 1900 && t < 2300" class="dots">
        <span /><span /><span />
      </div>
      <div v-if="t >= 2300" class="text">
        {{ first }}
      </div>

      <div v-if="t >= 2900" class="tool rise">
        <div class="tool-head">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" /></svg>
          <span class="mono">get_weather</span>
          <span :class="['badge', { done: toolState === 'Done' }]">
            <svg v-if="toolState !== 'Done'" class="spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M21 12a9 9 0 1 1-6.2-8.6" /></svg>
            {{ toolState }}
          </span>
        </div>
        <div class="tool-args mono">
          {{ args }}
        </div>
      </div>

      <div v-if="t >= 4700" class="weather rise">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2v2M4.9 4.9l1.4 1.4M2 12h2M19.1 4.9l-1.4 1.4" /><circle cx="12" cy="10" r="3.5" /><path d="M17.5 21H8a4 4 0 1 1 .9-7.9A5 5 0 0 1 18 14.5a3.25 3.25 0 0 1-.5 6.5z" /></svg>
        <div class="now">
          <span class="muted">Oslo · Partly cloudy</span>
          <span class="temp">19°</span>
        </div>
        <div class="days">
          <span>Tue<b>16°</b></span>
          <span>Wed<b>19°</b></span>
          <span>Thu<b>22°</b></span>
        </div>
      </div>

      <div v-if="t >= 5000" class="text">
        {{ final }}<span v-if="final.length < FINAL.length" class="caret">▍</span>
      </div>
    </div>

    <div class="input" aria-hidden="true">
      <span :class="['field', { filled: !sent && typed > 0 }]">
        {{ !sent && typed > 0 ? PROMPT.slice(0, typed) : 'Ask anything…' }}<span v-if="!sent && t >= 300" class="caret">|</span>
      </span>
      <span :class="['send', { active: !sent && typed > 0 }]">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
      </span>
    </div>
  </div>
</template>

<style scoped>
.hero-chat {
  --chat-bg: rgba(255, 255, 255, 0.92);
  --chat-surface: #f6f8fa;
  --chat-border: rgba(15, 23, 42, 0.1);
  --chat-text: #1f2328;
  --chat-muted: #57606a;

  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 520px;
  height: 500px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid var(--chat-border);
  background: var(--chat-bg);
  color: var(--chat-text);
  box-shadow: 0 30px 70px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(8px);
  text-align: left;
}

.dark .hero-chat {
  --chat-bg: rgba(17, 22, 29, 0.92);
  --chat-surface: #0d1117;
  --chat-border: rgba(255, 255, 255, 0.09);
  --chat-text: #e6edf3;
  --chat-muted: #9aa4af;

  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(66, 184, 131, 0.06);
}

.bar {
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border-bottom: 1px solid var(--chat-border);
}

.light {
  width: 11px;
  height: 11px;
  border-radius: 50%;
}

.title {
  margin-left: 12px;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  color: var(--chat-muted);
}

.body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px 22px 0;
  font-size: 14.5px;
  line-height: 1.55;
}

.user {
  align-self: flex-end;
  max-width: 80%;
  padding: 9px 14px;
  border-radius: 14px 14px 4px 14px;
  background: #42b883;
  color: #06140d;
  font-weight: 500;
}

.dots {
  display: flex;
  gap: 5px;
  padding: 6px 2px;
}

.dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--chat-muted);
  animation: bounce 1.2s ease-in-out infinite;
}

.dots span:nth-child(2) { animation-delay: 0.15s; }
.dots span:nth-child(3) { animation-delay: 0.3s; }

.text {
  color: var(--chat-text);
}

.mono {
  font-family: var(--vp-font-family-mono);
}

.tool {
  border: 1px solid var(--chat-border);
  border-radius: 10px;
  background: var(--chat-surface);
  overflow: hidden;
}

.tool-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  font-size: 12.5px;
  color: var(--chat-muted);
}

.tool-head .mono {
  color: var(--chat-text);
}

.badge {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11.5px;
  background: rgba(127, 127, 127, 0.12);
  color: var(--chat-muted);
}

.badge.done {
  background: rgba(66, 184, 131, 0.15);
  color: var(--vp-c-brand-1);
}

.tool-args {
  padding: 8px 12px;
  border-top: 1px solid var(--chat-border);
  font-size: 12px;
  color: var(--chat-muted);
}

.weather {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid rgba(66, 184, 131, 0.3);
  background: linear-gradient(135deg, rgba(66, 184, 131, 0.14), rgba(53, 73, 94, 0.12));
}

.now {
  display: flex;
  flex-direction: column;
}

.muted {
  font-size: 13px;
  color: var(--chat-muted);
}

.temp {
  font-size: 30px;
  font-weight: 700;
  line-height: 1.1;
}

.days {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.days span {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(127, 127, 127, 0.1);
  font-size: 11px;
  color: var(--chat-muted);
}

.days b {
  font-size: 14px;
  color: var(--chat-text);
}

.input {
  margin: 16px;
  padding: 10px 10px 10px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 14px;
  border: 1px solid var(--chat-border);
  background: var(--chat-surface);
}

.field {
  flex: 1;
  font-size: 14px;
  color: var(--chat-muted);
  opacity: 0.8;
}

.field.filled {
  color: var(--chat-text);
  opacity: 1;
}

.send {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(127, 127, 127, 0.2);
  color: var(--chat-bg);
  transition: background-color 0.2s;
}

.send.active {
  background: #42b883;
  color: #06140d;
}

.caret {
  color: #42b883;
  animation: blink 1s step-end infinite;
}

.spin {
  animation: spin 0.9s linear infinite;
}

.rise {
  animation: rise 0.35s ease-out both;
}

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes blink { 50% { opacity: 0; } }
@keyframes bounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.5; } 40% { transform: translateY(-4px); opacity: 1; } }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

@media (prefers-reduced-motion: reduce) {
  .caret, .spin, .rise, .dots span { animation: none; }
}

@media (max-width: 960px) {
  .hero-chat {
    height: 460px;
    margin: 0 auto;
  }
}

@media (max-width: 480px) {
  .hero-chat {
    height: 440px;
  }

  .days {
    display: none;
  }
}
</style>
