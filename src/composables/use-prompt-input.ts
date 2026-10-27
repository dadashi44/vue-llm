import { computed, nextTick, ref, watch, type Ref } from 'vue'
import type { ChatStatus } from '../types'
import type { SendMessageInput } from './use-chat'

export interface UsePromptInputOptions {
  /** Submit on Enter; Shift+Enter inserts a newline. Default `true`. */
  submitOnEnter?: boolean
  /** Grow the textarea with its content up to this many rows. Default `8`. */
  maxRows?: number
  /** Accepted file types, as in `<input accept>` (e.g. `'image/*,.pdf'`). Default: any. */
  accept?: string
  /** Maximum number of attached files. Default: unlimited. */
  maxFiles?: number
  /** Called when files are rejected by `accept` or `maxFiles` */
  onReject?: (files: File[], reason: 'type' | 'count') => void
}

/** The parts of `useChat` the prompt input needs */
export interface PromptInputChat {
  input: Ref<string>
  status: Ref<ChatStatus>
  sendMessage: (message?: SendMessageInput) => Promise<void>
}

export interface UsePromptInputReturn {
  /** Bind with `ref="textarea"` */
  textarea: Ref<HTMLTextAreaElement | null>
  files: Ref<File[]>
  /** True while files are dragged over the drop zone */
  isDragging: Ref<boolean>
  canSubmit: Ref<boolean>
  submit: () => Promise<void>
  addFiles: (files: FileList | File[] | null | undefined) => void
  removeFile: (file: File) => void
  /** Spread on the textarea: `v-bind="handlers"` (keydown, paste) */
  handlers: {
    onKeydown: (event: KeyboardEvent) => void
    onPaste: (event: ClipboardEvent) => void
  }
  /** Spread on the drop zone: `v-bind="dropzone"` */
  dropzone: {
    onDragenter: (event: DragEvent) => void
    onDragover: (event: DragEvent) => void
    onDragleave: (event: DragEvent) => void
    onDrop: (event: DragEvent) => void
  }
  /** Recalculate the textarea height */
  resize: () => void
}

/**
 * Headless logic for a chat input: Enter to send, IME-safe, auto-growing textarea,
 * attachments from the file picker, clipboard and drag-and-drop.
 */
export function usePromptInput(chat: PromptInputChat, options: UsePromptInputOptions = {}): UsePromptInputReturn {
  const textarea = ref<HTMLTextAreaElement | null>(null)
  const files = ref<File[]>([]) as Ref<File[]>
  const isDragging = ref(false)
  let dragDepth = 0

  const busy = computed(() => chat.status.value === 'submitted' || chat.status.value === 'streaming')
  const canSubmit = computed(() => !busy.value && (chat.input.value.trim() !== '' || files.value.length > 0))

  const accepts = (file: File): boolean => {
    if (!options.accept) return true
    return options.accept.split(',').map(s => s.trim().toLowerCase()).filter(Boolean).some((rule) => {
      if (rule.startsWith('.')) return file.name.toLowerCase().endsWith(rule)
      if (rule.endsWith('/*')) return file.type.toLowerCase().startsWith(rule.slice(0, -1))
      return file.type.toLowerCase() === rule
    })
  }

  const addFiles = (incoming: FileList | File[] | null | undefined): void => {
    const list = Array.from(incoming ?? [])
    if (!list.length) return

    const rejectedType = list.filter(f => !accepts(f))
    if (rejectedType.length) options.onReject?.(rejectedType, 'type')

    let accepted = list.filter(accepts)
    if (options.maxFiles !== undefined) {
      const room = Math.max(0, options.maxFiles - files.value.length)
      if (accepted.length > room) options.onReject?.(accepted.slice(room), 'count')
      accepted = accepted.slice(0, room)
    }
    if (accepted.length) files.value = [...files.value, ...accepted]
  }

  const removeFile = (file: File): void => {
    files.value = files.value.filter(f => f !== file)
  }

  const resize = (): void => {
    const el = textarea.value
    if (!el || typeof getComputedStyle === 'undefined') return
    const style = getComputedStyle(el)
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5 || 20
    const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0)
    const border = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0)
    // scrollHeight includes padding but not border; style.height depends on box-sizing
    const borderBox = style.boxSizing === 'border-box'
    const toHeight = (contentWithPadding: number): number => borderBox ? contentWithPadding + border : contentWithPadding - padding
    const maxContent = lineHeight * (options.maxRows ?? 8) + padding
    el.style.height = 'auto'
    const overflow = el.scrollHeight > maxContent
    el.style.height = `${toHeight(Math.min(el.scrollHeight, maxContent))}px`
    el.style.overflowY = overflow ? 'auto' : 'hidden'
  }

  watch(chat.input, () => nextTick(resize))
  watch(textarea, () => nextTick(resize))

  const submit = async (): Promise<void> => {
    if (!canSubmit.value) return
    const text = chat.input.value
    const attached = files.value
    chat.input.value = ''
    files.value = []
    await chat.sendMessage(attached.length ? { text, files: attached } : text)
  }

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' || event.shiftKey || options.submitOnEnter === false) return
    // Enter confirms IME composition (Chinese, Japanese, Korean…) and must not send
    if (event.isComposing || event.keyCode === 229) return
    event.preventDefault()
    void submit()
  }

  const onPaste = (event: ClipboardEvent): void => {
    const pasted = Array.from(event.clipboardData?.files ?? [])
    if (!pasted.length) return
    event.preventDefault()
    addFiles(pasted)
  }

  const hasFiles = (event: DragEvent): boolean => Array.from(event.dataTransfer?.types ?? []).includes('Files')

  const dropzone = {
    onDragenter(event: DragEvent) {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth++
      isDragging.value = true
    },
    onDragover(event: DragEvent) {
      if (hasFiles(event)) event.preventDefault()
    },
    onDragleave(event: DragEvent) {
      if (!hasFiles(event)) return
      // dragleave also fires when moving between children; only reset when leaving the zone
      dragDepth = Math.max(0, dragDepth - 1)
      if (dragDepth === 0) isDragging.value = false
    },
    onDrop(event: DragEvent) {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth = 0
      isDragging.value = false
      addFiles(event.dataTransfer?.files)
    },
  }

  return {
    textarea,
    files,
    isDragging,
    canSubmit,
    submit,
    addFiles,
    removeFile,
    handlers: { onKeydown, onPaste },
    dropzone,
    resize,
  }
}
