import { computed } from 'vue'
import { useData } from 'vitepress'

const STRINGS = {
  'en-US': {
    badge: 'v1.3 — Generative UI, DevTools & Chat UI',
    copy: 'Copy install command',
    copied: 'Copied',
    phrases: ['streaming tokens into a reactive ref', 'rendering tool calls as Vue components', 'running Llama right in your browser', 'inspecting every request in DevTools'],
  },
  'ru-RU': {
    badge: 'v1.3 — Generative UI, DevTools и Chat UI',
    copy: 'Скопировать команду установки',
    copied: 'Скопировано',
    phrases: ['стримим токены в реактивный ref', 'рендерим вызовы инструментов Vue-компонентами', 'запускаем Llama прямо в браузере', 'смотрим каждый запрос в DevTools'],
  },
  'zh-CN': {
    badge: 'v1.3 — 生成式 UI、DevTools 与聊天界面',
    copy: '复制安装命令',
    copied: '已复制',
    phrases: ['将 token 流式写入响应式 ref', '把工具调用渲染成 Vue 组件', '直接在浏览器中运行 Llama', '在 DevTools 中查看每个请求'],
  },
  'pt-BR': {
    badge: 'v1.3 — Generative UI, DevTools e Chat UI',
    copy: 'Copiar comando de instalação',
    copied: 'Copiado',
    phrases: ['transmitindo tokens para um ref reativo', 'renderizando chamadas de ferramentas como componentes Vue', 'rodando Llama direto no navegador', 'inspecionando cada requisição no DevTools'],
  },
  'es-ES': {
    badge: 'v1.3 — Generative UI, DevTools y Chat UI',
    copy: 'Copiar comando de instalación',
    copied: 'Copiado',
    phrases: ['transmitiendo tokens a un ref reactivo', 'renderizando llamadas a herramientas como componentes Vue', 'ejecutando Llama directamente en tu navegador', 'inspeccionando cada petición en DevTools'],
  },
  'ja-JP': {
    badge: 'v1.3 — Generative UI・DevTools・チャット UI',
    copy: 'インストールコマンドをコピー',
    copied: 'コピーしました',
    phrases: ['トークンをリアクティブな ref にストリーミング', 'ツール呼び出しを Vue コンポーネントで描画', 'ブラウザで Llama をそのまま実行', 'すべてのリクエストを DevTools で確認'],
  },
}

export type SiteStrings = (typeof STRINGS)['en-US']

/** Short UI strings for the custom theme parts, in the current page's language */
export function useStrings() {
  const { lang } = useData()
  return computed<SiteStrings>(() => STRINGS[lang.value as keyof typeof STRINGS] ?? STRINGS['en-US'])
}
