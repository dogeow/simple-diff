// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import TextComparePage from './TextComparePage'
import { useTextDiffStore } from '../stores/text-diff-store'

describe('TextComparePage', () => {
  afterEach(() => {
    cleanup()
    useTextDiffStore.setState({
      leftText: '',
      rightText: '',
      leftLabel: '',
      rightLabel: '',
      result: null,
      computing: false,
      error: null,
      charLevel: false,
    })
  })

  it('does not show the auto-compare helper text', () => {
    render(<TextComparePage />)

    expect(screen.queryByText('粘贴或拖入文本后自动对比')).toBeNull()
    expect(screen.getByRole('button', { name: '交换 ⇄' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '清空' })).toBeTruthy()
  })
})