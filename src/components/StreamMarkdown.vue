<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '../core/markdown.js'

const props = defineProps<{
  content: string
  streaming?: boolean
  render?: (markdown: string) => string
}>()

const html = computed(() => (props.render ?? renderMarkdown)(props.content))
// One root element (`.vue-llm-stream`), which Vue 2.7 requires
</script>

<template>
  <div class="vue-llm-stream">
    <div class="vue-llm-markdown" v-html="html" />
    <span v-if="streaming" class="vue-llm-cursor" aria-hidden="true">▊</span>
  </div>
</template>

<style>
.vue-llm-cursor {
  animation: vue-llm-blink 0.7s step-end infinite;
}
@keyframes vue-llm-blink {
  50% { opacity: 0; }
}
</style>
