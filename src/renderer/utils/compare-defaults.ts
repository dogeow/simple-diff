import { useCompareStore } from '../stores/compare-store'
import { useSettingsStore } from '../stores/settings-store'

/**
 * 把「设置 → 对比」里的默认值灌进 compare store。
 *
 * 调用时机只有一个：应用启动、且没有任何可恢复的对比标签（App.tsx 的恢复 effect）。
 * 之后每一个新会话都继承上一个会话的表单值——那是 chunk 5 F1 有意为之的语义
 * （`startNewCompareSession()` 保留路径 / 来源类型 / 比较依据 / 会话过滤，只清结果），
 * 所以这些偏好的作用域就是「一个全新工作区从什么值开始」，设置面板里也是这么写的。
 */
export function applyCompareDefaults(): void {
  const { strategies, viewMode, hideDot, hideDotFilter } = useSettingsStore.getState().compareDefaults
  const compareState = useCompareStore.getState()

  compareState.setStrategies([...strategies])
  compareState.setViewMode(viewMode)
  compareState.setHideDot(hideDot)
  compareState.setHideDotFilter(hideDotFilter)
}
