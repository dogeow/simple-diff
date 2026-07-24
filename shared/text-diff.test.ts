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

  it('anchors on unique lines and is not hijacked by short repeated matches', () => {
    // `renderer.render(...)` appears twice on the right (once at top, once inside
    // animate()) so it is NOT unique on the right. `window.addEventListener` is
    // unique on both sides, so patience anchors on it and keeps the two
    // addEventListener lines on the same visual row.
    const left = [
      'window.addEventListener(\'resize\', () => {',
      '  renderer.render(scene, camera)',
      '})',
    ].join('\n')

    const right = [
      'renderer.render(scene, camera)',
      'function animate() {',
      '  renderer.render(scene, camera)',
      '}',
      'animate()',
      'window.addEventListener(\'resize\', () => {',
      '  camera.updateProjectionMatrix()',
      '})',
    ].join('\n')

    const result = computeTextDiff(left, right)

    const leftRow = result.leftLines.findIndex(
      (l) => l.content === 'window.addEventListener(\'resize\', () => {',
    )
    const rightRow = result.rightLines.findIndex(
      (l) => l.content === 'window.addEventListener(\'resize\', () => {',
    )

    expect(leftRow).toBeGreaterThanOrEqual(0)
    expect(leftRow).toBe(rightRow)
    expect(result.leftLines[leftRow].type).toBe('equal')
    expect(result.rightLines[rightRow].type).toBe('equal')
  })

  it('aligns edited lines across an insert instead of zip-skewing', () => {
    const left = ['keep', 'oldValue = 1', 'trail'].join('\n')
    const right = ['keep', 'inserted', 'oldValue = 2', 'trail'].join('\n')

    const result = computeTextDiff(left, right)

    const leftEdit = result.leftLines.findIndex((l) => l.content === 'oldValue = 1')
    const rightEdit = result.rightLines.findIndex((l) => l.content === 'oldValue = 2')
    const rightInsert = result.rightLines.findIndex((l) => l.content === 'inserted')

    expect(leftEdit).toBe(rightEdit)
    expect(result.leftLines[leftEdit].type).toBe('remove')
    expect(result.rightLines[rightEdit].type).toBe('add')
    expect(rightInsert).toBeGreaterThanOrEqual(0)
    expect(rightInsert).not.toBe(leftEdit)
    expect(result.leftLines[rightInsert].content).toBe('')
  })

  it('aligns edited lines across a delete instead of zip-skewing', () => {
    const left = ['keep', 'removed', 'oldValue = 1', 'trail'].join('\n')
    const right = ['keep', 'oldValue = 2', 'trail'].join('\n')

    const result = computeTextDiff(left, right)

    const leftEdit = result.leftLines.findIndex((l) => l.content === 'oldValue = 1')
    const rightEdit = result.rightLines.findIndex((l) => l.content === 'oldValue = 2')
    const leftDelete = result.leftLines.findIndex((l) => l.content === 'removed')

    expect(leftEdit).toBe(rightEdit)
    expect(leftDelete).not.toBe(leftEdit)
    expect(result.rightLines[leftDelete].content).toBe('')
  })

  it('emits equal for identical non-unique middle lines via LCS', () => {
    const left = ['alpha', 'shared', 'beta'].join('\n')
    const right = ['gamma', 'shared', 'delta'].join('\n')

    const result = computeTextDiff(left, right)

    const leftShared = result.leftLines.findIndex((l) => l.content === 'shared')
    const rightShared = result.rightLines.findIndex((l) => l.content === 'shared')

    expect(leftShared).toBe(rightShared)
    expect(result.leftLines[leftShared].type).toBe('equal')
    expect(result.rightLines[rightShared].type).toBe('equal')
  })

  it('pairs near-duplicate lines by similarity when an insert precedes them', () => {
    const left = [
      'const color = 0x111111',
    ].join('\n')
    const right = [
      '// tint',
      'const color = 0x1a1a2e',
    ].join('\n')

    const result = computeTextDiff(left, right)

    const leftColor = result.leftLines.findIndex((l) => l.content.includes('0x111111'))
    const rightColor = result.rightLines.findIndex((l) => l.content.includes('0x1a1a2e'))

    expect(leftColor).toBe(rightColor)
    expect(result.leftLines[leftColor].type).toBe('remove')
    expect(result.rightLines[rightColor].type).toBe('add')
  })

  it('does not let a unique blank line hijack patience anchors', () => {
    const left = [
      'function a() {',
      '',
      '  return 1',
      '}',
    ].join('\n')
    const right = [
      'function b() {',
      '  setup()',
      '',
      '  return 2',
      '}',
    ].join('\n')

    const result = computeTextDiff(left, right)

    const leftReturn = result.leftLines.findIndex((l) => l.content === '  return 1')
    const rightReturn = result.rightLines.findIndex((l) => l.content === '  return 2')

    expect(leftReturn).toBe(rightReturn)
  })
})
