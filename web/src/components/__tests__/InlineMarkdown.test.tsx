import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InlineMarkdown } from '../InlineMarkdown'

describe('InlineMarkdown', () => {
  it('renders plain text as-is (fast path, no markdown parsing)', () => {
    render(<InlineMarkdown text="买牛奶 Buy milk 100%" />)
    expect(screen.getByText('买牛奶 Buy milk 100%')).toBeInTheDocument()
  })

  it('keeps emphasis-like characters literal when they are not valid markdown', () => {
    // 2 * 3 * 4 — 单个星号不构成强调,按原样输出
    render(<InlineMarkdown text="2 * 3 * 4" />)
    expect(screen.getByText('2 * 3 * 4')).toBeInTheDocument()
  })

  it('renders bold, italic, strikethrough and inline code', () => {
    render(<InlineMarkdown text="**b** *i* ~~s~~ `c`" />)
    expect(screen.getByText('b').tagName).toBe('STRONG')
    expect(screen.getByText('i').tagName).toBe('EM')
    expect(screen.getByText('s').tagName).toBe('DEL')
    expect(screen.getByText('c').tagName).toBe('CODE')
  })

  it('renders links that open in a new tab', () => {
    render(<InlineMarkdown text="see [docs](https://example.com)" />)
    const a = screen.getByRole('link', { name: 'docs' })
    expect(a).toHaveAttribute('href', 'https://example.com')
    expect(a).toHaveAttribute('target', '_blank')
  })

  it('autolinks bare URLs (GFM)', () => {
    render(<InlineMarkdown text="go https://example.com now" />)
    expect(screen.getByRole('link', { name: 'https://example.com' })).toBeInTheDocument()
  })

  it('flattens multi-paragraph text with a space (no bare concatenation)', () => {
    const { container } = render(<InlineMarkdown text={'第一段 **b**\n\nSecond paragraph'} />)
    expect(container.textContent?.replace(/\s+/g, ' ').trim()).toBe('第一段 b Second paragraph')
  })

  it('keeps line-start block markers literal — no headings/lists/quotes', () => {
    const { container } = render(<InlineMarkdown text="# Heading **with bold**" />)
    expect(container.querySelector('h1')).toBeNull()
    expect(screen.getByText('with bold').tagName).toBe('STRONG')
    expect(screen.getByText('# Heading', { exact: false })).toBeInTheDocument()
  })

  it('keeps list/bullet prefixes literal while still parsing inline syntax', () => {
    render(<InlineMarkdown text="- 紧急 `code`" />)
    expect(screen.getByText('code').tagName).toBe('CODE')
    expect(screen.getByText('- 紧急', { exact: false })).toBeInTheDocument()
  })

  it('renders a lone thematic break marker literally instead of dropping it', () => {
    render(<InlineMarkdown text="---" />)
    expect(screen.getByText('---')).toBeInTheDocument()
  })

  it('renders image alt text instead of the image', () => {
    const { container } = render(<InlineMarkdown text="![logo](https://example.com/x.png)" />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('logo')).toBeInTheDocument()
  })

  it('escapes raw HTML (no script element)', () => {
    const { container } = render(<InlineMarkdown text="a<script>alert(1)</script>" />)
    expect(container.querySelector('script')).toBeNull()
  })

  it('link clicks do not bubble to the host element', () => {
    const onHostClick = vi.fn()
    render(
      <div onClick={onHostClick}>
        <InlineMarkdown text="[docs](https://example.com)" />
      </div>,
    )
    fireEvent.click(screen.getByRole('link', { name: 'docs' }))
    expect(onHostClick).not.toHaveBeenCalled()
  })
})
