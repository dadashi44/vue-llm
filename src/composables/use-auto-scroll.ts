import { getCurrentScope, onScopeDispose, ref, watch, type Ref } from 'vue'

export interface UseAutoScrollOptions {
  /** Distance from the bottom, in px, that still counts as "at the bottom". Default `48`. */
  threshold?: number
}

export interface UseAutoScrollReturn {
  /** Bind to the scrollable element with `ref="container"` */
  container: Ref<HTMLElement | null>
  /** False once the user scrolls up; use it to show a "scroll to bottom" button */
  isAtBottom: Ref<boolean>
  scrollToBottom: (behavior?: ScrollBehavior) => void
}

/**
 * Keeps a message list pinned to the bottom while content streams in,
 * and lets the user scroll up to read without being pulled back down.
 */
export function useAutoScroll(options: UseAutoScrollOptions = {}): UseAutoScrollReturn {
  const container = ref<HTMLElement | null>(null)
  const isAtBottom = ref(true)
  const threshold = options.threshold ?? 48
  // Scroll events caused by our own scrolling must not unpin the list
  let programmatic = false

  const distanceFromBottom = (el: HTMLElement): number => el.scrollHeight - el.scrollTop - el.clientHeight

  const scrollToBottom = (behavior: ScrollBehavior = 'auto'): void => {
    const el = container.value
    if (!el) return
    programmatic = true
    isAtBottom.value = true
    if (typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight, behavior })
    else el.scrollTop = el.scrollHeight
    requestFrame(() => { programmatic = false })
  }

  const onScroll = (): void => {
    const el = container.value
    if (!el || programmatic) return
    isAtBottom.value = distanceFromBottom(el) <= threshold
  }

  const onContentChange = (): void => {
    if (isAtBottom.value) scrollToBottom()
  }

  let cleanup = (): void => {}

  watch(container, (el) => {
    cleanup()
    if (!el) return

    el.addEventListener('scroll', onScroll, { passive: true })
    const mutations = typeof MutationObserver !== 'undefined' ? new MutationObserver(onContentChange) : undefined
    mutations?.observe(el, { childList: true, subtree: true, characterData: true })
    // Images and code blocks can grow after they are inserted
    const resizes = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onContentChange) : undefined
    resizes?.observe(el)
    if (el.firstElementChild) resizes?.observe(el.firstElementChild)

    scrollToBottom()

    cleanup = () => {
      el.removeEventListener('scroll', onScroll)
      mutations?.disconnect()
      resizes?.disconnect()
      cleanup = () => {}
    }
  }, { flush: 'post' })

  if (getCurrentScope()) onScopeDispose(() => cleanup())

  return { container, isAtBottom, scrollToBottom }
}

function requestFrame(fn: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(fn))
  else setTimeout(fn, 32)
}
