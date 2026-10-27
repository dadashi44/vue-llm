---
layout: home

hero:
  name: vue-llm
  text: The missing AI SDK for Vue
  tagline: Streaming chat, completions and structured output as Vue composables — for OpenAI, Anthropic, Gemini and Ollama.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: API Reference
      link: /api/

features:
  - title: Reactive composables
    details: useChat, useCompletion and useObject with streaming, abort, regenerate and status refs.
  - title: Multi-provider
    details: OpenAI, Anthropic, Google Gemini and Ollama behind one LLMProvider interface.
  - title: Tool calling
    details: Automatic tool roundtrips with an onToolCall handler.
  - title: Attachments
    details: Images, PDFs, audio and text files, mapped to each provider's format.
  - title: Persistence
    details: Restore chat history from localStorage or any sync/async backend.
  - title: Resilient
    details: Retries with exponential backoff, client-side and server-side rate limiting.
  - title: Prompt templates
    details: "{{variables}} inferred at the type level, chat templates and reactive usePrompt."
  - title: Any backend
    details: Server-side tools in createLLMHandler, or plug useChat into your existing SSE backend with createSSEProvider.
  - title: Server & Nuxt
    details: Web-standard request handler, proxy provider and a Nuxt module with auto-imports.
---
