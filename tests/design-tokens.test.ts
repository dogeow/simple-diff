import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

/*
 * CSS 只能从磁盘读。`import './x.css?raw'` 和 `import.meta.glob(..., '?raw')` 在
 * Vitest 下都会被 Vite 的 CSS 插件接手，返回空串（测试环境 `css: false`）。
 */
const read = (name: string) => readFileSync(new URL(`../src/renderer/styles/${name}`, import.meta.url), 'utf8')
const tokensCss = read('tokens.css')
const globalsCss = read('globals.css')

/**
 * chunk 10 的出厂检查，机械版。
 *
 * 「两个主题都验过」不可能靠肉眼在 CI 里复现，但它拆得开的那一半可以：
 * 每一个语义别名都必须在浅色 `:root` 里有定义，凡是**颜色**类别名都必须在
 * `:root[data-theme='dark']` 里被改写——否则深色主题下它会静默沿用浅色值。
 */

const DARK_BLOCK = /:root\.dark,\s*:root\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/
const THEME_BLOCK = /@theme inline \{([\s\S]*?)\n\}/

function declaredVars(block: string): Set<string> {
  return new Set([...block.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]))
}

/** `@theme inline` 里 `--color-x: var(--ds-y)` 的右手边。 */
function themeColorSources(block: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const [, name, source] of block.matchAll(/^\s*(--color-[a-z0-9-]+)\s*:\s*var\((--ds-[a-z0-9-]+)\)/gm)) {
    out.set(name, source)
  }
  return out
}

const rootVars = declaredVars(tokensCss.replace(DARK_BLOCK, ''))
const darkBlock = tokensCss.match(DARK_BLOCK)?.[1] ?? ''
const darkVars = declaredVars(darkBlock)
const themeColors = themeColorSources(tokensCss.match(THEME_BLOCK)?.[1] ?? '')

describe('design tokens — 两个主题都必须落地', () => {
  it('parses both blocks', () => {
    expect(rootVars.size).toBeGreaterThan(100)
    expect(darkVars.size).toBeGreaterThan(50)
    expect(themeColors.size).toBeGreaterThan(30)
  })

  it('每个 @theme 颜色别名都指向一个真实存在的 --ds-* 令牌', () => {
    const missing = [...themeColors].filter(([, source]) => !rootVars.has(source))
    expect(missing).toEqual([])
  })

  it('每个 @theme 颜色别名在深色主题里都被改写过', () => {
    // 68 个别名，一个不落——包括两个主题取值相同的（图表槽位 6 的绿），
    // 它们也显式写在深色块里，所以这条断言没有例外名单。
    const notThemed = [...themeColors]
      .filter(([, source]) => !darkVars.has(source))
      .map(([name, source]) => `${name} -> ${source}`)

    expect(notThemed).toEqual([])
  })

  it('色盲友好差异色开关改写的是语义别名，不是硬编码颜色', () => {
    // globals.css 里那个开关必须只碰 `--ds-diff-*`，否则组件得自己判断偏好。
    const assignments = [...globalsCss.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1])
    expect(assignments.length).toBeGreaterThan(0)
    expect(assignments.every((name) => name.startsWith('--ds-diff-'))).toBe(true)
    expect(/#[0-9a-fA-F]{3,8}/.test(globalsCss)).toBe(false)
  })
})
