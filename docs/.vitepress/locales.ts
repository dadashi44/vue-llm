import type { DefaultTheme, LocaleConfig } from 'vitepress'

interface LocaleStrings {
  label: string
  lang: string
  /** og:locale */
  ogLocale: string
  description: string
  homeTitle: string
  nav: { guide: string; playground: string; api: string }
  groups: { intro: string; composables: string; features: string; integrations: string; reference: string }
  pages: Record<string, string>
  ui: {
    outline: string
    prev: string
    next: string
    lastUpdated: string
    editLink: string
    darkMode: string
    lightModeTitle: string
    darkModeTitle: string
    sidebarMenu: string
    returnToTop: string
    langMenu: string
    footer: string
    notFoundTitle: string
    notFoundQuote: string
    notFoundLink: string
  }
  search: {
    button: string
    placeholder: string
    reset: string
    back: string
    noResults: string
    select: string
    navigate: string
    close: string
  }
}

/** Locale keys double as URL prefixes; `root` is English at `/` */
export const LOCALES: Record<string, LocaleStrings> = {
  root: {
    label: 'English',
    lang: 'en-US',
    ogLocale: 'en_US',
    description: 'Vue composables for AI and LLM apps: streaming useChat, tool calling, Generative UI and in-browser models for OpenAI, Anthropic, Gemini, Ollama and WebGPU. The missing AI SDK for Vue and Nuxt.',
    homeTitle: 'the AI SDK for Vue',
    nav: { guide: 'Guide', playground: 'Playground', api: 'API' },
    groups: { intro: 'Introduction', composables: 'Composables', features: 'Features', integrations: 'Integrations', reference: 'Reference' },
    pages: {
      'getting-started': 'Getting Started',
      'providers': 'Providers',
      'in-browser': 'In-Browser Models',
      'security': 'Security',
      'tool-calling': 'Tool Calling',
      'generative-ui': 'Generative UI',
      'attachments': 'Attachments',
      'persistence': 'Persistence',
      'prompt-templates': 'Prompt Templates',
      'middleware': 'Middleware',
      'retries-rate-limiting': 'Retries & Rate Limiting',
      'server': 'Server & Proxy',
      'custom-backends': 'Custom Backends',
      'components': 'Components',
      'chat-ui': 'Chat UI',
    },
    ui: {
      outline: 'On this page',
      prev: 'Previous page',
      next: 'Next page',
      lastUpdated: 'Last updated',
      editLink: 'Edit this page on GitHub',
      darkMode: 'Appearance',
      lightModeTitle: 'Switch to light theme',
      darkModeTitle: 'Switch to dark theme',
      sidebarMenu: 'Menu',
      returnToTop: 'Return to top',
      langMenu: 'Change language',
      footer: 'Released under the MIT License.',
      notFoundTitle: 'PAGE NOT FOUND',
      notFoundQuote: 'This page does not exist, or it has not been translated yet.',
      notFoundLink: 'Take me home',
    },
    search: {
      button: 'Search',
      placeholder: 'Search docs',
      reset: 'Reset search',
      back: 'Close search',
      noResults: 'No results for',
      select: 'to select',
      navigate: 'to navigate',
      close: 'to close',
    },
  },
  ru: {
    label: 'Русский',
    lang: 'ru-RU',
    ogLocale: 'ru_RU',
    description: 'Vue-композаблы для AI- и LLM-приложений: стриминговый useChat, вызов инструментов, Generative UI и модели прямо в браузере для OpenAI, Anthropic, Gemini, Ollama и WebGPU. AI SDK для Vue и Nuxt.',
    homeTitle: 'AI SDK для Vue',
    nav: { guide: 'Руководство', playground: 'Песочница', api: 'API' },
    groups: { intro: 'Введение', composables: 'Композаблы', features: 'Возможности', integrations: 'Интеграции', reference: 'Справочник' },
    pages: {
      'getting-started': 'Быстрый старт',
      'providers': 'Провайдеры',
      'in-browser': 'Модели в браузере',
      'security': 'Безопасность',
      'tool-calling': 'Вызов инструментов',
      'generative-ui': 'Generative UI',
      'attachments': 'Вложения',
      'persistence': 'Сохранение истории',
      'prompt-templates': 'Шаблоны промптов',
      'middleware': 'Middleware',
      'retries-rate-limiting': 'Повторы и лимиты',
      'server': 'Сервер и прокси',
      'custom-backends': 'Свой бэкенд',
      'components': 'Компоненты',
      'chat-ui': 'Chat UI',
    },
    ui: {
      outline: 'На этой странице',
      prev: 'Предыдущая страница',
      next: 'Следующая страница',
      lastUpdated: 'Обновлено',
      editLink: 'Редактировать страницу на GitHub',
      darkMode: 'Оформление',
      lightModeTitle: 'Включить светлую тему',
      darkModeTitle: 'Включить тёмную тему',
      sidebarMenu: 'Меню',
      returnToTop: 'Наверх',
      langMenu: 'Сменить язык',
      footer: 'Распространяется по лицензии MIT.',
      notFoundTitle: 'СТРАНИЦА НЕ НАЙДЕНА',
      notFoundQuote: 'Такой страницы нет или её ещё не перевели.',
      notFoundLink: 'На главную',
    },
    search: {
      button: 'Поиск',
      placeholder: 'Поиск по документации',
      reset: 'Сбросить поиск',
      back: 'Закрыть поиск',
      noResults: 'Ничего не найдено по запросу',
      select: 'выбрать',
      navigate: 'перейти',
      close: 'закрыть',
    },
  },
  zh: {
    label: '简体中文',
    lang: 'zh-CN',
    ogLocale: 'zh_CN',
    description: '面向 AI 与 LLM 应用的 Vue 组合式函数：流式 useChat、工具调用、生成式 UI 以及浏览器内运行的模型，支持 OpenAI、Anthropic、Gemini、Ollama 和 WebGPU。Vue 与 Nuxt 的 AI SDK。',
    homeTitle: 'Vue 的 AI SDK',
    nav: { guide: '指南', playground: '在线体验', api: 'API' },
    groups: { intro: '介绍', composables: '组合式函数', features: '功能', integrations: '集成', reference: '参考' },
    pages: {
      'getting-started': '快速开始',
      'providers': '模型提供方',
      'in-browser': '浏览器内模型',
      'security': '安全',
      'tool-calling': '工具调用',
      'generative-ui': '生成式 UI',
      'attachments': '附件',
      'persistence': '持久化',
      'prompt-templates': '提示词模板',
      'middleware': '中间件',
      'retries-rate-limiting': '重试与限流',
      'server': '服务端与代理',
      'custom-backends': '自定义后端',
      'components': '组件',
      'chat-ui': '聊天界面',
    },
    ui: {
      outline: '本页目录',
      prev: '上一页',
      next: '下一页',
      lastUpdated: '最后更新于',
      editLink: '在 GitHub 上编辑此页',
      darkMode: '外观',
      lightModeTitle: '切换到浅色模式',
      darkModeTitle: '切换到深色模式',
      sidebarMenu: '菜单',
      returnToTop: '返回顶部',
      langMenu: '切换语言',
      footer: '基于 MIT 许可发布。',
      notFoundTitle: '页面未找到',
      notFoundQuote: '该页面不存在，或尚未翻译。',
      notFoundLink: '返回首页',
    },
    search: {
      button: '搜索',
      placeholder: '搜索文档',
      reset: '清除查询条件',
      back: '关闭搜索',
      noResults: '无法找到相关结果',
      select: '选择',
      navigate: '切换',
      close: '关闭',
    },
  },
  pt: {
    label: 'Português (Brasil)',
    lang: 'pt-BR',
    ogLocale: 'pt_BR',
    description: 'Composables Vue para apps de IA e LLM: useChat com streaming, chamada de ferramentas, Generative UI e modelos no navegador para OpenAI, Anthropic, Gemini, Ollama e WebGPU. O AI SDK para Vue e Nuxt.',
    homeTitle: 'o AI SDK para Vue',
    nav: { guide: 'Guia', playground: 'Playground', api: 'API' },
    groups: { intro: 'Introdução', composables: 'Composables', features: 'Recursos', integrations: 'Integrações', reference: 'Referência' },
    pages: {
      'getting-started': 'Primeiros passos',
      'providers': 'Provedores',
      'in-browser': 'Modelos no navegador',
      'security': 'Segurança',
      'tool-calling': 'Chamada de ferramentas',
      'generative-ui': 'Generative UI',
      'attachments': 'Anexos',
      'persistence': 'Persistência',
      'prompt-templates': 'Templates de prompt',
      'middleware': 'Middleware',
      'retries-rate-limiting': 'Retentativas e limites',
      'server': 'Servidor e proxy',
      'custom-backends': 'Backends próprios',
      'components': 'Componentes',
      'chat-ui': 'Chat UI',
    },
    ui: {
      outline: 'Nesta página',
      prev: 'Página anterior',
      next: 'Próxima página',
      lastUpdated: 'Atualizado em',
      editLink: 'Editar esta página no GitHub',
      darkMode: 'Aparência',
      lightModeTitle: 'Mudar para o tema claro',
      darkModeTitle: 'Mudar para o tema escuro',
      sidebarMenu: 'Menu',
      returnToTop: 'Voltar ao topo',
      langMenu: 'Mudar idioma',
      footer: 'Distribuído sob a licença MIT.',
      notFoundTitle: 'PÁGINA NÃO ENCONTRADA',
      notFoundQuote: 'Esta página não existe ou ainda não foi traduzida.',
      notFoundLink: 'Voltar ao início',
    },
    search: {
      button: 'Buscar',
      placeholder: 'Buscar na documentação',
      reset: 'Limpar busca',
      back: 'Fechar busca',
      noResults: 'Nenhum resultado para',
      select: 'para selecionar',
      navigate: 'para navegar',
      close: 'para fechar',
    },
  },
  es: {
    label: 'Español',
    lang: 'es-ES',
    ogLocale: 'es_ES',
    description: 'Composables de Vue para apps de IA y LLM: useChat con streaming, llamadas a herramientas, Generative UI y modelos en el navegador para OpenAI, Anthropic, Gemini, Ollama y WebGPU. El AI SDK para Vue y Nuxt.',
    homeTitle: 'el AI SDK para Vue',
    nav: { guide: 'Guía', playground: 'Playground', api: 'API' },
    groups: { intro: 'Introducción', composables: 'Composables', features: 'Funciones', integrations: 'Integraciones', reference: 'Referencia' },
    pages: {
      'getting-started': 'Primeros pasos',
      'providers': 'Proveedores',
      'in-browser': 'Modelos en el navegador',
      'security': 'Seguridad',
      'tool-calling': 'Llamadas a herramientas',
      'generative-ui': 'Generative UI',
      'attachments': 'Adjuntos',
      'persistence': 'Persistencia',
      'prompt-templates': 'Plantillas de prompts',
      'middleware': 'Middleware',
      'retries-rate-limiting': 'Reintentos y límites',
      'server': 'Servidor y proxy',
      'custom-backends': 'Backends propios',
      'components': 'Componentes',
      'chat-ui': 'Chat UI',
    },
    ui: {
      outline: 'En esta página',
      prev: 'Página anterior',
      next: 'Página siguiente',
      lastUpdated: 'Actualizado',
      editLink: 'Editar esta página en GitHub',
      darkMode: 'Apariencia',
      lightModeTitle: 'Cambiar a tema claro',
      darkModeTitle: 'Cambiar a tema oscuro',
      sidebarMenu: 'Menú',
      returnToTop: 'Volver arriba',
      langMenu: 'Cambiar idioma',
      footer: 'Publicado bajo la licencia MIT.',
      notFoundTitle: 'PÁGINA NO ENCONTRADA',
      notFoundQuote: 'Esta página no existe o todavía no está traducida.',
      notFoundLink: 'Volver al inicio',
    },
    search: {
      button: 'Buscar',
      placeholder: 'Buscar en la documentación',
      reset: 'Limpiar búsqueda',
      back: 'Cerrar búsqueda',
      noResults: 'Sin resultados para',
      select: 'para seleccionar',
      navigate: 'para navegar',
      close: 'para cerrar',
    },
  },
  ja: {
    label: '日本語',
    lang: 'ja-JP',
    ogLocale: 'ja_JP',
    description: 'AI・LLM アプリのための Vue コンポーザブル：ストリーミング対応の useChat、ツール呼び出し、Generative UI、ブラウザ内モデル。OpenAI、Anthropic、Gemini、Ollama、WebGPU に対応した Vue と Nuxt のための AI SDK。',
    homeTitle: 'Vue のための AI SDK',
    nav: { guide: 'ガイド', playground: 'プレイグラウンド', api: 'API' },
    groups: { intro: 'はじめに', composables: 'コンポーザブル', features: '機能', integrations: '連携', reference: 'リファレンス' },
    pages: {
      'getting-started': 'はじめよう',
      'providers': 'プロバイダー',
      'in-browser': 'ブラウザ内モデル',
      'security': 'セキュリティ',
      'tool-calling': 'ツール呼び出し',
      'generative-ui': 'Generative UI',
      'attachments': '添付ファイル',
      'persistence': '永続化',
      'prompt-templates': 'プロンプトテンプレート',
      'middleware': 'ミドルウェア',
      'retries-rate-limiting': 'リトライとレート制限',
      'server': 'サーバーとプロキシ',
      'custom-backends': 'カスタムバックエンド',
      'components': 'コンポーネント',
      'chat-ui': 'チャット UI',
    },
    ui: {
      outline: 'このページの内容',
      prev: '前のページ',
      next: '次のページ',
      lastUpdated: '最終更新',
      editLink: 'GitHub でこのページを編集',
      darkMode: '外観',
      lightModeTitle: 'ライトテーマに切り替え',
      darkModeTitle: 'ダークテーマに切り替え',
      sidebarMenu: 'メニュー',
      returnToTop: 'トップに戻る',
      langMenu: '言語を変更',
      footer: 'MIT ライセンスの下で公開されています。',
      notFoundTitle: 'ページが見つかりません',
      notFoundQuote: 'このページは存在しないか、まだ翻訳されていません。',
      notFoundLink: 'ホームに戻る',
    },
    search: {
      button: '検索',
      placeholder: 'ドキュメントを検索',
      reset: '検索をリセット',
      back: '検索を閉じる',
      noResults: '見つかりませんでした',
      select: '選択',
      navigate: '移動',
      close: '閉じる',
    },
  },
}

export const LOCALE_KEYS = Object.keys(LOCALES)

/** URL prefix of a locale: '' for English, 'ru/' for Russian */
export const localePrefix = (key: string): string => (key === 'root' ? '' : `${key}/`)

/** Splits `ru/guide/use-chat.md` into its locale key and the locale-independent path */
export function splitLocale(relativePath: string): { key: string; path: string } {
  const first = relativePath.split('/')[0]
  return LOCALE_KEYS.includes(first) && first !== 'root'
    ? { key: first, path: relativePath.slice(first.length + 1) }
    : { key: 'root', path: relativePath }
}

function themeConfig(key: string, s: LocaleStrings, repoUrl: string): DefaultTheme.Config {
  const p = `/${localePrefix(key)}`
  const page = (slug: string) => ({ text: s.pages[slug], link: `${p}guide/${slug}` })

  return {
    nav: [
      { text: s.nav.guide, link: `${p}guide/getting-started` },
      { text: s.nav.playground, link: `${p}playground` },
      { text: s.nav.api, link: `${p}api/` },
      { text: 'npm', link: 'https://www.npmjs.com/package/vue-llm' },
    ],
    sidebar: [
      { text: s.groups.intro, items: [page('getting-started'), page('providers'), page('in-browser'), page('security')] },
      {
        text: s.groups.composables,
        items: [
          { text: 'useChat', link: `${p}guide/use-chat` },
          { text: 'useCompletion', link: `${p}guide/use-completion` },
          { text: 'useObject', link: `${p}guide/use-object` },
          page('tool-calling'),
          page('generative-ui'),
        ],
      },
      {
        text: s.groups.features,
        items: [page('attachments'), page('persistence'), page('prompt-templates'), page('middleware'), page('retries-rate-limiting')],
      },
      {
        text: s.groups.integrations,
        items: [
          page('server'),
          page('custom-backends'),
          { text: 'Nuxt', link: `${p}guide/nuxt` },
          { text: 'DevTools', link: `${p}guide/devtools` },
          page('components'),
          page('chat-ui'),
        ],
      },
      { text: s.groups.reference, items: [{ text: 'API', link: `${p}api/` }] },
    ],
    outline: { label: s.ui.outline },
    docFooter: { prev: s.ui.prev, next: s.ui.next },
    lastUpdated: { text: s.ui.lastUpdated },
    editLink: { pattern: `${repoUrl}/edit/main/docs/:path`, text: s.ui.editLink },
    darkModeSwitchLabel: s.ui.darkMode,
    lightModeSwitchTitle: s.ui.lightModeTitle,
    darkModeSwitchTitle: s.ui.darkModeTitle,
    sidebarMenuLabel: s.ui.sidebarMenu,
    returnToTopLabel: s.ui.returnToTop,
    langMenuLabel: s.ui.langMenu,
    footer: { message: s.ui.footer },
    notFound: { title: s.ui.notFoundTitle, quote: s.ui.notFoundQuote, linkText: s.ui.notFoundLink, link: p },
  }
}

export function localesConfig(repoUrl: string): LocaleConfig<DefaultTheme.Config> {
  return Object.fromEntries(LOCALE_KEYS.map((key) => {
    const s = LOCALES[key]
    return [key, {
      label: s.label,
      lang: s.lang,
      description: s.description,
      ...(key !== 'root' && { link: `/${key}/` }),
      themeConfig: themeConfig(key, s, repoUrl),
    }]
  }))
}

/** Translations for the local search box, per locale */
export function searchLocales(): Record<string, { translations: DefaultTheme.LocalSearchOptions['translations'] }> {
  return Object.fromEntries(LOCALE_KEYS.map((key) => {
    const t = LOCALES[key].search
    return [key, {
      translations: {
        button: { buttonText: t.button, buttonAriaLabel: t.button },
        modal: {
          displayDetails: 'Details',
          resetButtonTitle: t.reset,
          backButtonTitle: t.back,
          noResultsText: t.noResults,
          footer: { selectText: t.select, navigateText: t.navigate, closeText: t.close },
        },
      },
    }]
  }))
}
