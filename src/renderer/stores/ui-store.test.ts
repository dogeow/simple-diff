import { beforeEach, describe, expect, it } from 'vitest'
import { EMPTY_TREE_SELECTION, useUIStore } from './ui-store'

beforeEach(() => {
  useUIStore.setState({ overlay: null, treeSelection: EMPTY_TREE_SELECTION })
})

describe('ui-store overlays', () => {
  it('只允许同时打开一个叠加层', () => {
    useUIStore.getState().openOverlay('settings')
    expect(useUIStore.getState().overlay).toBe('settings')

    useUIStore.getState().openOverlay('history')
    expect(useUIStore.getState().overlay).toBe('history')
  })

  it('toggleOverlay 对同一个叠加层是开关，对另一个是切换', () => {
    useUIStore.getState().toggleOverlay('palette')
    expect(useUIStore.getState().overlay).toBe('palette')

    useUIStore.getState().toggleOverlay('palette')
    expect(useUIStore.getState().overlay).toBeNull()

    useUIStore.getState().openOverlay('palette')
    useUIStore.getState().toggleOverlay('shortcuts')
    expect(useUIStore.getState().overlay).toBe('shortcuts')
  })

  it('closeOverlay 关闭最上层', () => {
    useUIStore.getState().openOverlay('ssh')
    useUIStore.getState().closeOverlay()
    expect(useUIStore.getState().overlay).toBeNull()
  })
})

describe('ui-store 目录树选择', () => {
  it('setTreeSelection 同时接受新值与更新函数', () => {
    useUIStore.getState().setTreeSelection({ selectedPaths: new Set(['a']), anchorPath: 'a' })
    expect([...useUIStore.getState().treeSelection.selectedPaths]).toEqual(['a'])

    useUIStore.getState().setTreeSelection((current) => ({
      selectedPaths: new Set([...current.selectedPaths, 'b']),
      anchorPath: 'b',
    }))
    expect([...useUIStore.getState().treeSelection.selectedPaths]).toEqual(['a', 'b'])
    expect(useUIStore.getState().treeSelection.anchorPath).toBe('b')
  })

  it('clearTreeSelection 清空选择与锚点', () => {
    useUIStore.getState().setTreeSelection({ selectedPaths: new Set(['a', 'b']), anchorPath: 'a' })
    useUIStore.getState().clearTreeSelection()

    expect(useUIStore.getState().treeSelection.selectedPaths.size).toBe(0)
    expect(useUIStore.getState().treeSelection.anchorPath).toBeNull()
  })
})
