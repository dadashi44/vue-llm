import { type Ref, unref } from 'vue'

// Local equivalents of Vue 3.3's MaybeRef/MaybeRefOrGetter/toValue, so composables also run on Vue 2.7
export type MaybeRef<T> = T | Ref<T>
export type MaybeRefOrGetter<T> = MaybeRef<T> | (() => T)

export function toValue<T>(source: MaybeRefOrGetter<T>): T {
  return typeof source === 'function' ? (source as () => T)() : unref(source)
}
