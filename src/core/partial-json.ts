/**
 * Parses JSON that may be cut off mid-stream, e.g. `{"city":"Os` → `{ city: 'Os' }`.
 * Open strings and containers are closed; an incomplete trailing key or value is dropped.
 * Returns `undefined` when nothing usable has arrived yet.
 */
export function parsePartialJSON(text: string): unknown {
  const input = text.trim()
  if (!input) return undefined

  try {
    return JSON.parse(input)
  } catch {
    // incomplete, repair below
  }

  const closers: string[] = []
  // Positions where the prefix can be cut and closed into valid JSON, with the closers needed there
  const cuts: { at: number; closers: string }[] = []
  let inString = false
  let escaped = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]

    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') {
        inString = false
        cuts.push({ at: i + 1, closers: closers.join('') })
      }
      continue
    }

    if (ch === '"') {
      inString = true
    } else if (ch === '{' || ch === '[') {
      closers.unshift(ch === '{' ? '}' : ']')
      cuts.push({ at: i + 1, closers: closers.join('') })
    } else if (ch === '}' || ch === ']') {
      closers.shift()
      cuts.push({ at: i + 1, closers: closers.join('') })
    } else if (ch === ',') {
      cuts.push({ at: i, closers: closers.join('') })
    }
  }

  // Keep a streaming string value growing: close the string where it was cut
  if (inString) {
    const body = escaped ? input.slice(0, -1) : input
    const value = tryParse(body.replace(/\\u[0-9a-fA-F]{0,3}$/, '') + '"' + closers.join(''))
    if (value !== undefined) return value
  } else {
    const value = tryParse(input.replace(/[\s,]+$/, '') + closers.join(''))
    if (value !== undefined) return value
  }

  for (let i = cuts.length - 1; i >= 0; i--) {
    const cut = cuts[i]
    const value = tryParse(input.slice(0, cut.at).replace(/[\s,]+$/, '') + cut.closers)
    if (value !== undefined) return value
  }

  return undefined
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
