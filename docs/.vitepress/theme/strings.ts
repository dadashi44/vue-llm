import { computed } from 'vue'
import { useData } from 'vitepress'

const STRINGS = {
  'en-US': {
    consent: 'We use Amplitude to see which docs and demos help. It stores an anonymous device id.',
    accept: 'Accept',
    decline: 'Decline',
    badge: 'v1.3 — Generative UI, DevTools & Chat UI',
    copy: 'Copy install command',
    copied: 'Copied',
    phrases: ['streaming tokens into a reactive ref', 'rendering tool calls as Vue components', 'running Llama right in your browser', 'inspecting every request in DevTools'],
  },
  'ru-RU': {
    consent: 'Мы используем Amplitude, чтобы понимать, какие страницы и демо полезны. Он хранит анонимный идентификатор устройства.',
    accept: 'Принять',
    decline: 'Отклонить',
    badge: 'v1.3 — Generative UI, DevTools и Chat UI',
    copy: 'Скопировать команду установки',
    copied: 'Скопировано',
    phrases: ['стримим токены в реактивный ref', 'рендерим вызовы инструментов Vue-компонентами', 'запускаем Llama прямо в браузере', 'смотрим каждый запрос в DevTools'],
  },
  'zh-CN': {
    consent: '我们使用 Amplitude 了解哪些文档和演示更有帮助。它会存储一个匿名设备 ID。',
    accept: '接受',
    decline: '拒绝',
    badge: 'v1.3 — 生成式 UI、DevTools 与聊天界面',
    copy: '复制安装命令',
    copied: '已复制',
    phrases: ['将 token 流式写入响应式 ref', '把工具调用渲染成 Vue 组件', '直接在浏览器中运行 Llama', '在 DevTools 中查看每个请求'],
  },
  'pt-BR': {
    consent: 'Usamos o Amplitude para entender quais páginas e demos ajudam. Ele guarda um ID anônimo do dispositivo.',
    accept: 'Aceitar',
    decline: 'Recusar',
    badge: 'v1.3 — Generative UI, DevTools e Chat UI',
    copy: 'Copiar comando de instalação',
    copied: 'Copiado',
    phrases: ['transmitindo tokens para um ref reativo', 'renderizando chamadas de ferramentas como componentes Vue', 'rodando Llama direto no navegador', 'inspecionando cada requisição no DevTools'],
  },
  'es-ES': {
    consent: 'Usamos Amplitude para saber qué páginas y demos te ayudan. Guarda un ID anónimo del dispositivo.',
    accept: 'Aceptar',
    decline: 'Rechazar',
    badge: 'v1.3 — Generative UI, DevTools y Chat UI',
    copy: 'Copiar comando de instalación',
    copied: 'Copiado',
    phrases: ['transmitiendo tokens a un ref reactivo', 'renderizando llamadas a herramientas como componentes Vue', 'ejecutando Llama directamente en tu navegador', 'inspeccionando cada petición en DevTools'],
  },
  'ja-JP': {
    consent: 'どのドキュメントやデモが役立っているかを知るために Amplitude を使用しています。匿名のデバイス ID を保存します。',
    accept: '同意する',
    decline: '拒否する',
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
