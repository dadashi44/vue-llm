<script setup lang="ts">
import type { Component } from 'vue'
import StreamMarkdown from './StreamMarkdown.vue'
import type { DataPart, ToolCallPart, UIMessage } from '../types.js'

defineProps<{
  message: UIMessage
  /** Components that render tool calls, keyed by tool name (Generative UI) */
  components?: Record<string, Component>
  /** Components that render data parts, keyed by their `name` */
  dataComponents?: Record<string, Component>
  /** Markdown renderer for text parts, see StreamMarkdown */
  render?: (markdown: string) => string
}>()

const emit = defineEmits<{
  'tool-result': [payload: { toolCallId: string; result: unknown }]
}>()

defineSlots<{
  tool?: (props: { part: ToolCallPart; addResult: (result: unknown) => void }) => unknown
  data?: (props: { part: DataPart }) => unknown
}>()

// Stable keys keep tool and data components mounted while the message streams
const partKey = (part: UIMessage['parts'][number], index: number): string | number => {
  if (part.type === 'tool-call') return part.toolCallId
  if (part.type === 'data' && part.id !== undefined) return `data:${part.name}:${part.id}`
  return index
}

const toolProps = (part: ToolCallPart) => ({
  toolCallId: part.toolCallId,
  toolName: part.toolName,
  args: part.args,
  state: part.state,
  result: part.result,
  error: part.error,
  addResult: (result: unknown) => emit('tool-result', { toolCallId: part.toolCallId, result }),
})
</script>

<template>
  <div class="vue-llm-message" :data-role="message.role">
    <template v-for="(part, index) in message.parts" :key="partKey(part, index)">
      <template v-if="part.type === 'text'">
        <div v-if="message.role === 'user'" class="vue-llm-text">
          {{ part.text }}
        </div>
        <StreamMarkdown
          v-else
          :content="part.text"
          :streaming="part.state === 'streaming'"
          :render="render"
        />
      </template>

      <details v-else-if="part.type === 'reasoning'" class="vue-llm-reasoning" :open="part.state === 'streaming'">
        <summary>Reasoning</summary>
        <div>{{ part.text }}</div>
      </details>

      <template v-else-if="part.type === 'tool-call'">
        <component
          :is="components[part.toolName]"
          v-if="components?.[part.toolName]"
          v-bind="toolProps(part)"
        />
        <slot v-else name="tool" :part="part" :add-result="toolProps(part).addResult" />
      </template>

      <template v-else-if="part.type === 'data'">
        <component
          :is="dataComponents[part.name]"
          v-if="dataComponents?.[part.name]"
          :name="part.name"
          :data="part.data"
        />
        <slot v-else name="data" :part="part" />
      </template>

      <template v-else-if="part.type === 'file'">
        <img
          v-if="part.mediaType.startsWith('image/')"
          class="vue-llm-file"
          :src="part.url"
          :alt="part.filename ?? ''"
        >
        <span v-else class="vue-llm-file">{{ part.filename ?? part.mediaType }}</span>
      </template>

      <a
        v-else-if="part.type === 'source' && /^https?:/i.test(part.url)"
        class="vue-llm-source"
        :href="part.url"
        target="_blank"
        rel="noopener noreferrer"
      >{{ part.title ?? part.url }}</a>
    </template>
  </div>
</template>

<style scoped>
.vue-llm-text {
  white-space: pre-wrap;
}

.vue-llm-file {
  max-width: 100%;
}
</style>
