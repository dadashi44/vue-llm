const SAFE_URL = /^(?:https?:|mailto:|\/(?!\/)|#|\.\.?\/)/i

export function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    const fence = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)/.exec(line)
    if (fence) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith(fence[1])) {
        code.push(lines[i])
        i++
      }
      i++
      const lang = fence[2] ? ` class="language-${escapeHTML(fence[2])}"` : ''
      out.push(`<pre><code${lang}>${escapeHTML(code.join('\n'))}</code></pre>`)
      continue
    }

    if (!line.trim()) {
      i++
      continue
    }

    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (heading) {
      const level = heading[1].length
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`)
      i++
      continue
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push('<hr>')
      i++
      continue
    }

    if (/^\s*>/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      out.push(`<blockquote>${renderMarkdown(quote.join('\n'))}</blockquote>`)
      continue
    }

    if (isTableStart(lines, i)) {
      const header = splitRow(lines[i])
      const aligns = splitRow(lines[i + 1]).map(cell =>
        cell.endsWith(':') ? (cell.startsWith(':') ? 'center' : 'right') : cell.startsWith(':') ? 'left' : '')
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(splitRow(lines[i]))
        i++
      }
      const cell = (tag: string, text: string, col: number): string => {
        const align = aligns[col] ? ` style="text-align:${aligns[col]}"` : ''
        return `<${tag}${align}>${renderInline(text)}</${tag}>`
      }
      out.push(
        '<table><thead><tr>'
        + header.map((h, c) => cell('th', h, c)).join('')
        + '</tr></thead><tbody>'
        + rows.map(r => '<tr>' + header.map((_, c) => cell('td', r[c] ?? '', c)).join('') + '</tr>').join('')
        + '</tbody></table>',
      )
      continue
    }

    const listMatch = /^\s*([-*+]|\d+[.)])\s+/.exec(line)
    if (listMatch) {
      const ordered = /\d/.test(listMatch[1])
      const items: string[] = []
      while (i < lines.length) {
        const item = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i])
        if (item && /\d/.test(item[1]) === ordered) {
          items.push(item[2])
        } else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length > 0) {
          items[items.length - 1] += ' ' + lines[i].trim()
        } else {
          break
        }
        i++
      }
      const tag = ordered ? 'ol' : 'ul'
      const start = ordered && parseInt(listMatch[1], 10) !== 1 ? ` start="${parseInt(listMatch[1], 10)}"` : ''
      out.push(`<${tag}${start}>${items.map(item => `<li>${renderInline(item)}</li>`).join('')}</${tag}>`)
      continue
    }

    const paragraph: string[] = []
    while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) {
      paragraph.push(lines[i].trim())
      i++
    }
    out.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`)
  }

  return out.join('\n')
}

export function renderInline(text: string): string {
  return text
    .split(/(`+[^`]*`+)/)
    .map((segment, index) => {
      if (index % 2 === 1) {
        return `<code>${escapeHTML(segment.replace(/^`+|`+$/g, ''))}</code>`
      }
      return renderEmphasis(escapeHTML(segment))
    })
    .join('')
}

function renderEmphasis(escaped: string): string {
  return escaped
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (match, alt: string, url: string) =>
      isSafeURL(url) ? `<img src="${url}" alt="${alt}">` : alt)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, url: string) =>
      isSafeURL(url) ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>` : label)
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '<strong>$2</strong>')
    .replace(/(?<![\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])/g, '<em>$1</em>')
    .replace(/(?<![\w_])_(?=\S)(.+?)(?<=\S)_(?![\w_])/g, '<em>$1</em>')
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '<del>$1</del>')
}

function isSafeURL(escapedURL: string): boolean {
  const url = escapedURL.replace(/&amp;/g, '&').replace(/&#(x?[0-9a-f]+);?/gi, '?')
  return SAFE_URL.test(url.trim())
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim())
}

function isTableStart(lines: string[], i: number): boolean {
  return lines[i].includes('|')
    && i + 1 < lines.length
    && /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(lines[i + 1])
}

function startsBlock(lines: string[], i: number): boolean {
  const line = lines[i]
  return /^\s*(`{3,}|~{3,})/.test(line)
    || /^#{1,6}\s/.test(line)
    || /^\s*>/.test(line)
    || /^\s*([-*+]|\d+[.)])\s+/.test(line)
    || /^\s*([-*_])(\s*\1){2,}\s*$/.test(line)
    || isTableStart(lines, i)
}
