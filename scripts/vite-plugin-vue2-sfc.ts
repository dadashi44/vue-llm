import { transformWithEsbuild, type Plugin } from 'vite'
import { compileScript, compileTemplate, parse, rewriteDefault } from 'vue2/compiler-sfc'

/**
 * Compiles vue-llm's own .vue files with the Vue 2.7 compiler, for the `vue-llm/components/vue2`
 * build and the Vue 2.7 component tests. `@vitejs/plugin-vue2` can't be installed next to Vue 3
 * without --legacy-peer-deps, and our components need only a small part of it:
 * - no HMR and no <style>: component styles are global `.vue-llm-*` classes in vue-llm/style.css,
 *   so a scoped style is an error here;
 * - two Vue 3-only constructs in the shared source are adapted: the `defineSlots<…>()` line
 *   (types only) is removed, and the key moves off `<template v-for>` (Vue 3 wants it there,
 *   Vue 2 ignores it; the stateful children carry their own key).
 */
export function vue2SFC(): Plugin {
  return {
    name: 'vue-llm:vue2-sfc',
    enforce: 'pre',
    async transform(code, id) {
      if (!id.endsWith('.vue')) return

      const source = code
        .replace(/^defineSlots<\w+>\(\)\n/m, '')
        .replace(/(<template v-for="[^"]*")\s+:key="[^"]*"/g, '$1')
      const descriptor = parse({ source, filename: id, sourceMap: false })
      if (descriptor.styles.some(style => style.scoped)) {
        this.error(`${id}: scoped styles aren't supported by the Vue 2.7 build, use global .vue-llm-* classes`)
      }
      if (!descriptor.template) this.error(`${id}: a <template> is required`)

      const script = compileScript(descriptor, { id })
      const template = compileTemplate({
        source: descriptor.template.content,
        filename: id,
        bindings: script.bindings,
        isProduction: true,
        prettify: false,
      })
      const problems = [...template.errors, ...template.tips].map(e => (typeof e === 'string' ? e : e.msg))
      if (problems.length) this.error(`${id}: Vue 2.7 template compiler:\n${problems.join('\n')}`)

      const module = [
        rewriteDefault(script.content, '_sfc_main', ['typescript']),
        template.code,
        '_sfc_main.render = render',
        '_sfc_main.staticRenderFns = staticRenderFns',
        'export default _sfc_main',
      ].join('\n')
      return transformWithEsbuild(module, `${id}.ts`, { loader: 'ts', target: 'es2020' })
    },
  }
}
