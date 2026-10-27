import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../../src/core/markdown'

describe('renderMarkdown', () => {
  it('renders common blocks', () => {
    expect(renderMarkdown('# Title\n\nHello **world** and *you*.')).toBe('<h1>Title</h1>\n<p>Hello <strong>world</strong> and <em>you</em>.</p>')
    expect(renderMarkdown('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>')
    expect(renderMarkdown('3. c\n4. d')).toBe('<ol start="3"><li>c</li><li>d</li></ol>')
    expect(renderMarkdown('> quoted')).toBe('<blockquote><p>quoted</p></blockquote>')
    expect(renderMarkdown('---')).toBe('<hr>')
    expect(renderMarkdown('line one\nline two')).toBe('<p>line one<br>line two</p>')
  })

  it('renders fenced code with language and escapes it', () => {
    expect(renderMarkdown('```ts\nconst a = 1 < 2\n```')).toBe('<pre><code class="language-ts">const a = 1 &lt; 2</code></pre>')
  })

  it('renders an unclosed fence while streaming', () => {
    expect(renderMarkdown('Look:\n```js\nfoo()')).toBe('<p>Look:</p>\n<pre><code class="language-js">foo()</code></pre>')
  })

  it('renders inline code without applying emphasis inside', () => {
    expect(renderMarkdown('use `a*b*c` and `<div>`')).toBe('<p>use <code>a*b*c</code> and <code>&lt;div&gt;</code></p>')
  })

  it('renders tables with alignment', () => {
    expect(renderMarkdown('| a | b |\n|:--|--:|\n| 1 | **2** |')).toBe(
      '<table><thead><tr><th style="text-align:left">a</th><th style="text-align:right">b</th></tr></thead>'
      + '<tbody><tr><td style="text-align:left">1</td><td style="text-align:right"><strong>2</strong></td></tr></tbody></table>',
    )
  })

  it('renders safe links and images', () => {
    expect(renderMarkdown('[docs](https://x.dev/a?b=1&c=2)')).toBe(
      '<p><a href="https://x.dev/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">docs</a></p>',
    )
    expect(renderMarkdown('![cat](/cat.png)')).toBe('<p><img src="/cat.png" alt="cat"></p>')
  })

  describe('XSS', () => {
    it.each([
      ['raw HTML', '<img src=x onerror=alert(1)>'],
      ['script tag', '<script>alert(1)</script>'],
      ['html in code fence', '```\n<script>alert(1)</script>\n```'],
      ['html in table', '| a |\n|---|\n| <b onmouseover=alert(1)>x</b> |'],
    ])('escapes %s', (_name, input) => {
      const html = renderMarkdown(input)
      expect(html).not.toMatch(/<(img|script|b)\b/)
    })

    it.each([
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'javascript&#58;alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      '//evil.com',
    ])('drops unsafe link %s', (url) => {
      const html = renderMarkdown(`[click](${url}) ![img](${url})`)
      expect(html).not.toContain('href=')
      expect(html).not.toContain('src=')
    })

    it('cannot break out of attributes', () => {
      const html = renderMarkdown('[x](https://a.dev/"onmouseover="alert(1))')
      expect(html).not.toMatch(/"\s*onmouseover=/)
    })
  })
})
