<script setup lang="ts">
import type { ToolComponentProps } from '../../../../src/types'

type Booking = { restaurant: string; time: string; guests: number }
type Decision = Booking & { confirmed: boolean }

const props = defineProps<ToolComponentProps<Booking, Decision>>()

function decide(confirmed: boolean): void {
  const { restaurant = '', time = '', guests = 0 } = props.args ?? {}
  props.addResult({ restaurant, time, guests, confirmed })
}
</script>

<template>
  <div class="card">
    <div class="title">
      🍝 {{ props.args?.restaurant || '…' }}
    </div>
    <div class="details">
      <span>🕢 {{ props.args?.time || '…' }}</span>
      <span>👥 {{ props.args?.guests ?? '…' }} guests</span>
    </div>
    <div v-if="props.state === 'pending'" class="actions">
      <button class="primary" @click="decide(true)">
        Confirm
      </button>
      <button @click="decide(false)">
        Cancel
      </button>
    </div>
    <div v-else-if="props.state === 'result'" class="decision" :class="{ ok: props.result?.confirmed }">
      {{ props.result?.confirmed ? '✓ Confirmed' : '✗ Cancelled' }}
    </div>
    <div v-else class="waiting">
      {{ props.state }}…
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

.title {
  font-weight: 600;
}

.details {
  display: flex;
  gap: 14px;
  margin-top: 6px;
  color: var(--vp-c-text-2);
  font-size: 14px;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

button {
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  padding: 4px 14px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
}

button.primary {
  background: var(--vp-c-brand-3);
  border-color: var(--vp-c-brand-3);
  color: var(--vp-c-white);
}

.decision {
  margin-top: 10px;
  font-size: 14px;
  color: var(--vp-c-text-2);
}

.decision.ok {
  color: var(--vp-c-green-1);
}

.waiting {
  margin-top: 10px;
  font-size: 12px;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
}
</style>
