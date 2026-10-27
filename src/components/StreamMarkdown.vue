<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '../core/markdown'

const props = defineProps<{
  content: string
  streaming?: boolean
  render?: (markdown: string) => string
}>()

const html = computed(() => (props.render ?? renderMarkdown)(props.content))
</script>

<template>
  <div class="vue-llm-markdown" v-html="html" />
  <span v-if="streaming" class="vue-llm-cursor" aria-hidden="true">▊</span>
</template>

<style scoped>
.vue-llm-cursor {
  animation: vue-llm-blink 0.7s step-end infinite;
}
@keyframes vue-llm-blink {
  50% { opacity: 0; }
}
</style>
