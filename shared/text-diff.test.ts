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
})
