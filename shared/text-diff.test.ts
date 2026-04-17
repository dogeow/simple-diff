import { describe, expect, it } from 'vitest'
import { computeTextDiff } from './text-diff'

describe('computeTextDiff', () => {
  it('keeps related changed lines on the same visual row with placeholders', () => {
    const left = [
      'const scene = new THREE.Scene()',
      'scene.background = new THREE.Color(0x111111)',
    ].join('\n')

    const right = [
      '// 场景',
      'const scene = new THREE.Scene()',
      'scene.background = new THREE.Color(0x1a1a2e)',
    ].join('\n')

    const result = computeTextDiff(left, right)

    expect(result.leftLines).toEqual([
      { type: 'equal', lineNumber: -1, content: '' },
      { type: 'equal', lineNumber: 1, content: 'const scene = new THREE.Scene()' },
      { type: 'remove', lineNumber: 2, content: 'scene.background = new THREE.Color(0x111111)' },
    ])

    expect(result.rightLines).toEqual([
      { type: 'add', lineNumber: 1, content: '// 场景' },
      { type: 'equal', lineNumber: 2, content: 'const scene = new THREE.Scene()' },
      { type: 'add', lineNumber: 3, content: 'scene.background = new THREE.Color(0x1a1a2e)' },
    ])
  })
})
