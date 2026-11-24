// Type-checks dist/vue2 the way a Vue 2.7 project sees it (`vue` is Vue 2.7 here).
// Run `npm run build` first.
import { defineComponent } from 'vue'
import { MessageParts, StreamMarkdown, renderMarkdown } from 'vue-llm/components/vue2'
import type { MessagePartsProps, MessagePartsSlotProps } from 'vue-llm/components/vue2'

type IsAny<T> = 0 extends 1 & T ? true : false
function assertTyped<T>(_value: IsAny<T> extends true ? never : T): void {}

assertTyped(MessageParts)
assertTyped(StreamMarkdown)
assertTyped(renderMarkdown)

export const props: MessagePartsProps = { message: { id: '1', role: 'assistant', parts: [{ type: 'text', text: 'hi' }] } }
// @ts-expect-error message is required
export const missing: MessagePartsProps = {}
export const slot = (props: MessagePartsSlotProps['tool']) => props.addResult(props.part.args)

export const Chat = defineComponent({
  components: { MessageParts, StreamMarkdown },
  render: h => h(MessageParts, { props }),
})
