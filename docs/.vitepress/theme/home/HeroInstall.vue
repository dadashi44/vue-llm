<script setup lang="ts">
import { ref } from 'vue'
import { useStrings } from '../strings'

const strings = useStrings()
const copied = ref(false)

async function copy(): Promise<void> {
  await navigator.clipboard?.writeText('npm i vue-llm')
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <button type="button" class="hero-install" :aria-label="copied ? strings.copied : strings.copy" @click="copy">
    <span class="prompt" aria-hidden="true">$</span>
    <span>npm i <span class="pkg">vue-llm</span></span>
    <svg v-if="!copied" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
    <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
  </button>
</template>

<style scoped>
.hero-install {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-mono);
  font-size: 14px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.hero-install:hover {
  border-color: var(--vp-c-brand-1);
}

.hero-install svg {
  color: var(--vp-c-text-3);
}

.prompt {
  color: var(--vp-c-text-3);
}

.pkg {
  color: var(--vp-c-brand-1);
}

@media (max-width: 960px) {
  .hero-install {
    margin-left: auto;
    margin-right: auto;
  }
}
</style>
