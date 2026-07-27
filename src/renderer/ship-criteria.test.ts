import { describe, expect, it } from 'vitest'

/**
 * 设计蓝图 chunk 10 的出厂清单里，可以机械判定的那几条。
 *
 * 这些扫描本来是发布前手工跑的 `grep`。手工跑的结果保不住——下一个改动就能悄悄
 * 把一个原生确认框或者一个默认调色板类放回来。钉成测试，回归时直接报文件和行号。
 *
 * 调色板那一条**连注释和测试一起扫**：Tailwind 的扫描器读的是文件字节，不区分
 * 注释；一个只出现在注释里的类名同样会让它往产物 CSS 里塞一条 utility，而那条
 * utility 的层级压得过 `@layer base` 里的焦点环和 `body` 底色。这次扫描就抓到了
 * 两处（`SSHConfigForm` 的说明注释、这个文件自己的开头），都是真的漏进了 CSS。
 * 所以下面的调色板名单是拼出来的，谁也不写出完整字面量。
 */

const ALL = Object.entries(
  import.meta.glob('./**/*.{ts,tsx,html}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>,
).map(([file, text]) => ({ file, text }))

const SOURCES = ALL.filter(({ file }) => !/\.test\.tsx?$/.test(file))

interface ScanOptions {
  /** 连注释行一起扫。给那些「出现即生效」的东西用（比如 Tailwind 类名）。 */
  readonly comments?: boolean
  /** 连测试文件一起扫。 */
  readonly tests?: boolean
  readonly skip?: (file: string) => boolean
}

function scan(pattern: RegExp, { comments = false, tests = false, skip }: ScanOptions = {}): string[] {
  const hits: string[] = []
  for (const { file, text } of tests ? ALL : SOURCES) {
    if (skip?.(file)) continue
    text.split('\n').forEach((line, index) => {
      if (!comments && /^\s*(\/\/|\*|\/\*)/.test(line)) return
      pattern.lastIndex = 0
      if (pattern.test(line)) hits.push(`${file}:${index + 1} ${line.trim()}`)
    })
  }
  return hits
}

const PALETTE = [
  'neutral', 'blue', 'sky', 'violet', 'cyan', 'purple', 'emerald', 'amber', 'rose', 'green',
  'red', 'slate', 'gray', 'zinc', 'stone', 'orange', 'yellow', 'teal', 'indigo', 'fuchsia',
  'pink', 'lime',
].join('|')

describe('ship criteria (blueprint chunk 10)', () => {
  it('reads the whole renderer tree', () => {
    expect(SOURCES.length).toBeGreaterThan(60)
    expect(SOURCES.some((s) => s.file.endsWith('/index.html'))).toBe(true)
    expect(ALL.length).toBeGreaterThan(SOURCES.length)
  })

  it('没有硬编码颜色（只有 tokens.css 允许出现字面量 hex）', () => {
    expect(scan(/#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b/)).toEqual([])
  })

  it('哪里都不出现 Tailwind 默认调色板类名——注释和测试里也不行', () => {
    expect(scan(new RegExp(`\\b(?:${PALETTE})-(?:50|[1-9]50|[1-9]00)\\b`), { comments: true, tests: true }))
      .toEqual([])
  })

  it('没有 window.confirm / alert / prompt（§7.5）', () => {
    expect(scan(/\bwindow\.(confirm|alert|prompt)\s*\(/)).toEqual([])
    expect(scan(/(?<![.\w])(confirm|alert|prompt)\s*\(/, { skip: (f) => f.includes('/ui/') })).toEqual([])
  })

  it('没有任何地方关掉焦点环（§0 规则 3）', () => {
    expect(scan(/\boutline-none\b|outline:\s*none/, { comments: true, tests: true })).toEqual([])
  })

  it('图标按钮的 tooltip 没有被关掉（§6）', () => {
    expect(scan(/tooltip=\{false\}/)).toEqual([])
  })
})
