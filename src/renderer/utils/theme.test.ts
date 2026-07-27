// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { applyDiffPalette, applyTheme, resolveTheme } from './theme'

describe('theme utilities', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.theme
    delete document.documentElement.dataset.colorblindDiff
    document.documentElement.style.colorScheme = ''
  })

  it('resolves system theme preferences', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('applies the resolved theme to the document root', () => {
    expect(applyTheme('light', true)).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  // DESIGN-SYSTEM §1.5：色盲友好差异色是「一个 data 属性、零组件改动」，
  // 关掉时属性必须真的消失，否则 `globals.css` 的改写会一直生效。
  it('toggles the colorblind diff palette attribute', () => {
    applyDiffPalette(true)
    expect(document.documentElement.dataset.colorblindDiff).toBe('true')

    applyDiffPalette(false)
    expect(document.documentElement.dataset.colorblindDiff).toBeUndefined()
  })
})
