import { describe, it, expect, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { usePromptInput, type PromptInputChat } from '../../src/composables/use-prompt-input'
import { useAutoScroll } from '../../src/composables/use-auto-scroll'
import type { ChatStatus } from '../../src/types'

function fakeChat(status: ChatStatus = 'ready') {
  const chat = {
    input: ref(''),
    status: ref<ChatStatus>(status),
    sendMessage: vi.fn(async () => {}),
  } satisfies PromptInputChat
  return chat
}

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, ...init })
const file = (name: string, type: string) => new File(['x'], name, { type })

function dragEvent(type: string, files: File[] = []): DragEvent {
  const event = new Event(type, { cancelable: true }) as DragEvent
  Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files } })
  return event
}

describe('usePromptInput', () => {
  it('sends on Enter and clears the input', async () => {
    const chat = fakeChat()
    const { handlers } = usePromptInput(chat)
    chat.input.value = 'hello'

    const event = key({})
    handlers.onKeydown(event)
    await nextTick()

    expect(event.defaultPrevented).toBe(true)
    expect(chat.sendMessage).toHaveBeenCalledWith('hello')
    expect(chat.input.value).toBe('')
  })

  it('keeps Shift+Enter, IME composition and disabled submitOnEnter as newlines', () => {
    const chat = fakeChat()
    chat.input.value = 'hello'

    usePromptInput(chat).handlers.onKeydown(key({ shiftKey: true }))
    usePromptInput(chat).handlers.onKeydown(key({ isComposing: true }))
    usePromptInput(chat, { submitOnEnter: false }).handlers.onKeydown(key({}))

    expect(chat.sendMessage).not.toHaveBeenCalled()
  })

  it('does not submit empty input or while the chat is busy', async () => {
    const empty = fakeChat()
    empty.input.value = '   '
    await usePromptInput(empty).submit()
    expect(empty.sendMessage).not.toHaveBeenCalled()

    const busy = fakeChat('streaming')
    busy.input.value = 'hi'
    const prompt = usePromptInput(busy)
    expect(prompt.canSubmit.value).toBe(false)
    await prompt.submit()
    expect(busy.sendMessage).not.toHaveBeenCalled()
  })

  it('sends attached files and clears them', async () => {
    const chat = fakeChat()
    const prompt = usePromptInput(chat)
    const image = file('a.png', 'image/png')

    prompt.addFiles([image])
    expect(prompt.canSubmit.value).toBe(true)
    await prompt.submit()

    expect(chat.sendMessage).toHaveBeenCalledWith({ text: '', files: [image] })
    expect(prompt.files.value).toEqual([])
  })

  it('filters files by accept and maxFiles', () => {
    const onReject = vi.fn()
    const prompt = usePromptInput(fakeChat(), { accept: 'image/*, .pdf', maxFiles: 2, onReject })
    const png = file('a.png', 'image/png')
    const pdf = file('doc.PDF', '')
    const zip = file('x.zip', 'application/zip')
    const jpg = file('b.jpg', 'image/jpeg')

    prompt.addFiles([png, zip, pdf, jpg])

    expect(prompt.files.value).toEqual([png, pdf])
    expect(onReject).toHaveBeenCalledWith([zip], 'type')
    expect(onReject).toHaveBeenCalledWith([jpg], 'count')

    prompt.removeFile(png)
    expect(prompt.files.value).toEqual([pdf])
  })

  it('attaches pasted files but leaves pasted text alone', () => {
    const prompt = usePromptInput(fakeChat())
    const image = file('shot.png', 'image/png')

    const withFile = new Event('paste', { cancelable: true }) as ClipboardEvent
    Object.defineProperty(withFile, 'clipboardData', { value: { files: [image] } })
    prompt.handlers.onPaste(withFile)

    const withText = new Event('paste', { cancelable: true }) as ClipboardEvent
    Object.defineProperty(withText, 'clipboardData', { value: { files: [] } })
    prompt.handlers.onPaste(withText)

    expect(prompt.files.value).toEqual([image])
    expect(withFile.defaultPrevented).toBe(true)
    expect(withText.defaultPrevented).toBe(false)
  })

  it('tracks dragging across child elements and accepts dropped files', () => {
    const prompt = usePromptInput(fakeChat())
    const { dropzone } = prompt
    const pdf = file('a.pdf', 'application/pdf')

    dropzone.onDragenter(dragEvent('dragenter'))
    dropzone.onDragenter(dragEvent('dragenter')) // entering a child
    dropzone.onDragleave(dragEvent('dragleave')) // leaving the child
    expect(prompt.isDragging.value).toBe(true)

    dropzone.onDrop(dragEvent('drop', [pdf]))
    expect(prompt.isDragging.value).toBe(false)
    expect(prompt.files.value).toEqual([pdf])
  })

  it('grows the textarea up to maxRows', async () => {
    const chat = fakeChat()
    const prompt = usePromptInput(chat, { maxRows: 3 })
    const el = document.createElement('textarea')
    el.style.lineHeight = '20px'
    el.style.boxSizing = 'border-box'
    el.style.padding = '5px'
    el.style.border = '1px solid'
    let scrollHeight = 30 // one line + padding
    Object.defineProperty(el, 'scrollHeight', { get: () => scrollHeight })
    prompt.textarea.value = el
    await nextTick()
    await nextTick()
    expect(el.style.height).toBe('32px')

    scrollHeight = 200
    chat.input.value = 'many\nlines'
    await nextTick()
    await nextTick()
    expect(el.style.height).toBe('72px') // 3 rows + padding + border
    expect(el.style.overflowY).toBe('auto')
  })
})

describe('useAutoScroll', () => {
  function scroller() {
    const el = document.createElement('div')
    const metrics = { scrollHeight: 1000, clientHeight: 200 }
    let top = 0
    Object.defineProperty(el, 'scrollHeight', { get: () => metrics.scrollHeight })
    Object.defineProperty(el, 'clientHeight', { get: () => metrics.clientHeight })
    Object.defineProperty(el, 'scrollTop', { get: () => top, set: (v: number) => { top = Math.min(v, metrics.scrollHeight - metrics.clientHeight) } })
    el.scrollTo = ((opts: ScrollToOptions) => { el.scrollTop = opts.top ?? 0 }) as typeof el.scrollTo
    document.body.appendChild(el)
    return { el, metrics }
  }

  it('pins to the bottom, unpins when the user scrolls up and follows new content when pinned', async () => {
    const scope = effectScope()
    const { el, metrics } = scroller()
    const auto = scope.run(() => useAutoScroll({ threshold: 10 }))!

    auto.container.value = el
    await nextTick()
    expect(el.scrollTop).toBe(800)
    await new Promise(r => setTimeout(r, 50))

    el.scrollTop = 300
    el.dispatchEvent(new Event('scroll'))
    expect(auto.isAtBottom.value).toBe(false)

    metrics.scrollHeight = 1500
    el.appendChild(document.createElement('p'))
    await new Promise(r => setTimeout(r, 0))
    expect(el.scrollTop).toBe(300)

    auto.scrollToBottom()
    expect(el.scrollTop).toBe(1300)
    expect(auto.isAtBottom.value).toBe(true)
    await new Promise(r => setTimeout(r, 50))

    metrics.scrollHeight = 1800
    el.appendChild(document.createElement('p'))
    await new Promise(r => setTimeout(r, 0))
    expect(el.scrollTop).toBe(1600)

    scope.stop()
    el.remove()
  })
})
