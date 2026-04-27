export interface VisibleRowWindow {
  readonly startIndex: number
  readonly endIndex: number
  readonly topSpacerHeight: number
  readonly bottomSpacerHeight: number
}

export function getVisibleRowWindow(params: {
  readonly totalRows: number
  readonly scrollTop: number
  readonly viewportHeight: number
  readonly rowHeight: number
  readonly overscanRows: number
}): VisibleRowWindow {
  const { totalRows, scrollTop, viewportHeight, rowHeight, overscanRows } = params

  if (totalRows <= 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
    }
  }

  const safeViewportHeight = Math.max(viewportHeight, rowHeight)
  const visibleCount = Math.ceil(safeViewportHeight / rowHeight)
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscanRows)
  const endIndex = Math.min(totalRows, startIndex + visibleCount + overscanRows * 2)

  return {
    startIndex,
    endIndex,
    topSpacerHeight: startIndex * rowHeight,
    bottomSpacerHeight: Math.max(0, (totalRows - endIndex) * rowHeight),
  }
}