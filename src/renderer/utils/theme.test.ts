// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { applyTheme, resolveTheme } from './theme'

describe('theme utilities', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.theme
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
})
