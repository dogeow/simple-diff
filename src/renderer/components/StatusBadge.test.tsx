// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBadge from './StatusBadge'

describe('StatusBadge', () => {
  it('renders the comparing label without a leading icon', () => {
    render(<StatusBadge state="comparing" />)

    const badge = screen.getByText('对比中')

    expect(badge.textContent).toBe('对比中')
    expect(badge.children).toHaveLength(0)
  })
})