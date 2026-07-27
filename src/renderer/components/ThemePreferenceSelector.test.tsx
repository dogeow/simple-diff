// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ThemePreferenceSelector from './ThemePreferenceSelector'
import { useSettingsStore } from '../stores/settings-store'

beforeEach(() => {
  useSettingsStore.setState({ theme: 'system' })
})

afterEach(() => {
  cleanup()
})

describe('ThemePreferenceSelector', () => {
  it('是一组分段单选，三态一个不少', () => {
    render(<ThemePreferenceSelector />)

    const group = screen.getByRole('radiogroup', { name: '应用主题' })
    expect(group).toBeTruthy()
    expect(screen.getAllByRole('radio').map((radio) => radio.textContent)).toEqual([
      '跟随系统',
      '浅色',
      '深色',
    ])
  })

  it('当前偏好用 aria-checked 表达，而不是只有颜色', () => {
    useSettingsStore.setState({ theme: 'dark' })
    render(<ThemePreferenceSelector />)

    expect(screen.getByRole('radio', { name: '深色' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: '跟随系统' }).getAttribute('aria-checked')).toBe('false')
  })

  it('ThemeToggle 删除后，这里仍然能选回 system', async () => {
    useSettingsStore.setState({ theme: 'light' })
    const user = userEvent.setup()
    render(<ThemePreferenceSelector />)

    await user.click(screen.getByRole('radio', { name: '跟随系统' }))

    expect(useSettingsStore.getState().theme).toBe('system')
  })
})
