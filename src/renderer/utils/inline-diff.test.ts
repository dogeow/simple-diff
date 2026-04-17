import { describe, expect, it } from 'vitest'
import { buildInlineSegments } from './inline-diff'
import type { DiffLine } from '../../../shared/types'

describe('buildInlineSegments', () => {
  it('only emphasizes changed characters inside changed rows', () => {
    const leftLines: DiffLine[] = [
      { type: 'remove', lineNumber: 7, content: 'scene.background = new THREE.Color(0x111111)' },
    ]
    const rightLines: DiffLine[] = [
      { type: 'add', lineNumber: 8, content: 'scene.background = new THREE.Color(0x1a1a2e)' },
    ]

    const result = buildInlineSegments(leftLines, rightLines)
    const left = result.left.get(0) ?? []
    const right = result.right.get(0) ?? []

    expect(left.some((seg) => seg.text.includes('scene.background') && seg.emphasis)).toBe(false)
    expect(right.some((seg) => seg.text.includes('scene.background') && seg.emphasis)).toBe(false)
    expect(left.some((seg) => seg.emphasis)).toBe(true)
    expect(right.some((seg) => seg.emphasis)).toBe(true)
  })
})
