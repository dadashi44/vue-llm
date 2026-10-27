export interface SSEEvent {
  event?: string
  data: string
  id?: string
  retry?: number
}

export class SSEParserStream extends TransformStream<string, SSEEvent> {
  constructor() {
    let buffer = ''
    let event: Partial<SSEEvent> = {}

    const dispatch = (controller: TransformStreamDefaultController<SSEEvent>): void => {
      if (event.data !== undefined) {
        controller.enqueue({
          event: event.event,
          data: event.data,
          id: event.id,
          retry: event.retry,
        })
      }
      event = {}
    }

    const processLine = (line: string, controller: TransformStreamDefaultController<SSEEvent>): void => {
      if (line === '') {
        dispatch(controller)
        return
      }

      if (line.startsWith(':')) return

      const colonIdx = line.indexOf(':')
      const field = colonIdx === -1 ? line : line.slice(0, colonIdx)
      const value = colonIdx === -1 ? '' : line.slice(colonIdx + 1).replace(/^ /, '')

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
          if (/^\d+$/.test(value)) event.retry = parseInt(value, 10)
          break
      }
    }

    super({
      transform(chunk, controller) {
        buffer += chunk
        // A trailing CR may be the first half of a CRLF split across chunks, so keep it buffered
        const end = buffer.endsWith('\r') ? buffer.length - 1 : buffer.length
        const lines = buffer.slice(0, end).split(/\r\n|\r|\n/)
        buffer = (lines.pop() ?? '') + buffer.slice(end)
        for (const line of lines) processLine(line, controller)
      },

      flush(controller) {
        for (const line of buffer.split(/\r\n|\r|\n/)) {
          if (line) processLine(line, controller)
        }
        dispatch(controller)
      },
    })
  }
}
