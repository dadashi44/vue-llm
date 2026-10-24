<script setup lang="ts">
defineProps<{
  content: string
  streaming?: boolean
}>()
</script>

<template>
  <div class="vue-llm-markdown" v-html="content" />
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
