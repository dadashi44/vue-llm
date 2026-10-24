export interface SSEEvent {
  event?: string
  data: string
  id?: string
  retry?: number
}

export class SSEParserStream extends TransformStream<string, SSEEvent> {
  constructor() {
    let buffer = ''

    super({
      transform(chunk, controller) {
        buffer += chunk
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        let event: Partial<SSEEvent> = {}
        for (const line of lines) {
          if (line === '') {
            if (event.data !== undefined) {
              controller.enqueue({
                event: event.event,
                data: event.data,
                id: event.id,
                retry: event.retry,
              })
            }
            event = {}
            continue
          }

          if (line.startsWith(':')) continue

          const colonIdx = line.indexOf(':')
          if (colonIdx === -1) continue

          const field = line.slice(0, colonIdx)
          const value = line.slice(colonIdx + 1).replace(/^ /, '')

          switch (field) {
            case 'event':
              event.event = value
              break
            case 'data':
              event.data = event.data !== undefined ? event.data + '\n' + value : value
              break
            case 'id':
              event.id = value
              break
            case 'retry':
              event.retry = parseInt(value, 10)
              break
          }
        }
      },

      flush(controller) {
        if (buffer.trim()) {
          const lines = buffer.split('\n')
          let event: Partial<SSEEvent> = {}
          for (const line of lines) {
            if (line === '' && event.data !== undefined) {
              controller.enqueue({
                event: event.event,
                data: event.data,
                id: event.id,
                retry: event.retry,
              })
              event = {}
              continue
            }
            const colonIdx = line.indexOf(':')
            if (colonIdx === -1 || line.startsWith(':')) continue
            const field = line.slice(0, colonIdx)
            const value = line.slice(colonIdx + 1).replace(/^ /, '')
            if (field === 'data') {
              event.data = event.data !== undefined ? event.data + '\n' + value : value
            }
          }
        }
      },
    })
  }
}
