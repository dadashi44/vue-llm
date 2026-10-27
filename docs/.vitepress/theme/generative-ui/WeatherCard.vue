<script setup lang="ts">
import type { ToolComponentProps } from '../../../../src/types'

type Weather = { city: string; temp: number; condition: string; forecast: { day: string; temp: number }[] }

const props = defineProps<ToolComponentProps<{ city: string; days: number }, Weather>>()

const icon = (condition?: string) => ({ 'Sunny': '☀️', 'Partly cloudy': '⛅', 'Cloudy': '☁️', 'Light rain': '🌧️' })[condition ?? ''] ?? '🌡️'
</script>

<template>
  <div class="card weather" :class="{ loading: props.state !== 'result' }">
    <div class="head">
      <span class="city">{{ props.args?.city || '…' }}</span>
      <span class="state">{{ props.state }}</span>
    </div>
    <template v-if="props.result">
      <div class="now">
        <span class="icon">{{ icon(props.result.condition) }}</span>
        <span class="temp">{{ props.result.temp }}°</span>
        <span>{{ props.result.condition }}</span>
      </div>
      <div class="forecast">
        <div v-for="day in props.result.forecast" :key="day.day">
          <small>{{ day.day }}</small>
          <strong>{{ day.temp }}°</strong>
        </div>
      </div>
    </template>
    <div v-else-if="props.error" class="error">
      {{ props.error }}
    </div>
    <div v-else class="skeleton">
      <div /><div />
    </div>
  </div>
</template>

<style scoped>
.card {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 12px 14px;
  margin: 6px 0;
  background: var(--vp-c-bg);
  max-width: 340px;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.city {
  font-weight: 600;
}

.state {
  font-size: 11px;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
  background: var(--vp-c-default-soft);
  border-radius: 4px;
  padding: 1px 6px;
}

.now {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
}

.icon {
  font-size: 28px;
}

.temp {
  font-size: 28px;
  font-weight: 600;
}

.forecast {
  display: flex;
  gap: 8px;
}

.forecast > div {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px;
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}

.forecast small {
  color: var(--vp-c-text-2);
  font-size: 11px;
}

.skeleton {
  margin-top: 10px;
}

.skeleton > div {
  height: 14px;
  margin-top: 8px;
  border-radius: 4px;
  background: var(--vp-c-default-soft);
  animation: pulse 1.2s ease-in-out infinite;
}

.skeleton > div:last-child {
  width: 60%;
}

.error {
  color: var(--vp-c-danger-1);
}

@keyframes pulse {
  50% { opacity: 0.4; }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton > div {
    animation: none;
  }
}
</style>
