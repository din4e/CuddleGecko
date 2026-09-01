import { memo, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// 标题是一行文本:只认行内语法。任何块级结构(标题/列表/引用/表格/
// 代码块)都降级为行内内容,图片只留 alt 文本 —— 否则多行布局会撑破
// 紧凑的行高。
const passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>

const components: Components = {
  p: passthrough,
  h1: passthrough, h2: passthrough, h3: passthrough,
  h4: passthrough, h5: passthrough, h6: passthrough,
  ul: passthrough, ol: passthrough, li: passthrough,
  blockquote: passthrough, hr: passthrough, pre: passthrough,
  table: passthrough, thead: passthrough, tbody: passthrough,
  tr: passthrough, th: passthrough, td: passthrough,
  img: ({ alt }) => <>{alt ?? null}</>,
  // 链接吞掉 click/dblclick,避免冒泡触发宿主"点标题开抽屉 / 双击重命名"。
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="text-primary underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-foreground/10 px-1 font-mono text-[0.85em]">{children}</code>
  ),
}

// 快路径:标题几乎都不含 Markdown 语法,出现这些字符才进解析器
// (行内语法的起始符,以及 GFM 裸链接)。
const MAYBE_MARKDOWN = /[*_~`[\]!<\\]|:\/\/|www\./

// 行首块级标记(# 标题 / > 引用 / - + * 与 "1." 列表 / --- 分隔线)加
// 反斜杠转义,让它们保留字面文本 —— 降级渲染会直接吞掉标记符,而标题
// 里 "#42"、"- 紧急" 这类前缀应原样显示。仅当行内语法存在、确定要进
// 解析器时才会走到这里,纯快路径不受影响。
const BLOCK_MARKER = /^(\s*)(?:([#>+-]|\d+[.)])(\s|$)|(-{3,}|\*{3,}|_{3,})$)/
const escapeBlockMarkers = (text: string) =>
  text
    .split('\n')
    .map((line) => line.replace(BLOCK_MARKER, (_, ws: string, marker: string | undefined, sp: string | undefined, rule: string | undefined) =>
      rule ? `${ws}\\${rule}` : `${ws}\\${marker}${sp}`,
    ))
    .join('\n')

interface InlineMarkdownProps {
  text: string
}

/** 单行 Markdown 渲染,用于任务名称/描述预览这类一行文本:仅行内语法
 *  (加粗/斜体/删除线/行内代码/链接),react-markdown 默认转义 HTML,
 *  URL 经默认 urlTransform 过滤,无 XSS 面。 */
export const InlineMarkdown = memo(function InlineMarkdown({ text }: InlineMarkdownProps) {
  if (!MAYBE_MARKDOWN.test(text)) return <>{text}</>
  // 段落空行压成单个换行:多段降级为行内后,相邻块级的文本节点会直接
  // 拼接(FirstSecond),压行后交给 HTML 空白折叠自然得到空格。
  const flat = text.replace(/\n{2,}/g, '\n')
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {escapeBlockMarkers(flat)}
    </ReactMarkdown>
  )
})
