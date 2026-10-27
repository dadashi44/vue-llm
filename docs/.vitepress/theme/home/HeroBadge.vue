<script setup lang="ts">
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'
import { useStrings } from '../strings'

const strings = useStrings()
const { localeIndex } = useData()
const href = computed(() => withBase(`/${localeIndex.value === 'root' ? '' : `${localeIndex.value}/`}guide/generative-ui`))
</script>

<template>
  <a class="hero-badge" :href="href">
    <span class="pulse" aria-hidden="true" />
    {{ strings.badge }}
  </a>
</template>

<style scoped>
.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 35%, transparent);
  background: color-mix(in srgb, var(--vp-c-brand-1) 8%, transparent);
  color: var(--vp-c-brand-1);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  text-decoration: none;
  transition: border-color 0.2s;
}

.hero-badge:hover {
  border-color: var(--vp-c-brand-1);
}

.pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--vp-c-brand-1) 60%, transparent);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  70% { box-shadow: 0 0 0 6px transparent; }
}

@media (prefers-reduced-motion: reduce) {
  .pulse { animation: none; }
}
</style>
