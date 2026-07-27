import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Skeleton } from './feedback'
import { ContextMenu } from './menu'
import type { MenuItem, Tone } from './types'

export interface Column<Row> {
  id: string
  header: React.ReactNode
  cell: (row: Row, index: number) => React.ReactNode
  width?: number | 'auto'
  minWidth?: number
  align?: 'left' | 'right'
  sortable?: boolean
  mono?: boolean
  truncate?: boolean
}

export interface SortState {
  columnId: string
  direction: 'asc' | 'desc'
}

const ROW_TONE: Record<Tone, string> = {
  neutral: '',
  accent: 'bg-accent-quiet',
  success: 'bg-success-quiet',
  warning: 'bg-warning-quiet',
  danger: 'bg-danger-quiet',
  running: 'bg-running-quiet',
  idle: 'bg-idle-quiet',
}

export interface DataTableProps<Row> {
  columns: Column<Row>[]
  rows: Row[]
  rowKey: (r: Row, i: number) => string
  variant?: 'report' | 'grid'
  density?: 'compact' | 'comfortable'
  sort?: SortState | null
  onSortChange?: (s: SortState | null) => void
  selection?: { selected: Set<string>; onChange: (s: Set<string>) => void; mode: 'single' | 'multi' }
  /** Click + Enter + Space — always all three. */
  onRowActivate?: (r: Row, i: number) => void
  onRowContextMenu?: (r: Row) => MenuItem[]
  rowTone?: (r: Row) => Tone | null
  loading?: boolean
  /** Trailing SkeletonRow + `aria-busy` while results stream in. */
  streaming?: boolean
  empty?: React.ReactNode
  stickyHeader?: boolean
  className?: string
  'aria-label'?: string
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  variant = 'report',
  density = 'compact',
  sort,
  onSortChange,
  selection,
  onRowActivate,
  onRowContextMenu,
  rowTone,
  loading,
  streaming,
  empty,
  stickyHeader = true,
  className,
  'aria-label': ariaLabel,
}: DataTableProps<Row>) {
  const rowHeight =
    variant === 'grid'
      ? density === 'compact'
        ? 'h-row-grid'
        : 'h-row-grid-comfy'
      : 'h-row-table'
  const cellPad = variant === 'grid' ? 'px-2' : 'px-3'

  const toggleSort = (columnId: string) => {
    if (!onSortChange) return
    if (sort?.columnId !== columnId) onSortChange({ columnId, direction: 'asc' })
    else if (sort.direction === 'asc') onSortChange({ columnId, direction: 'desc' })
    else onSortChange(null)
  }

  if (loading) return <Skeleton variant="row" count={6} className={cn('p-2', className)} />
  if (rows.length === 0 && empty) return <>{empty}</>

  return (
    <table aria-label={ariaLabel} aria-busy={streaming || undefined} className={cn('w-full text-sm', className)}>
      <thead className={cn('bg-surface-2 text-fg-muted', stickyHeader && 'sticky top-0 z-sticky')}>
        <tr>
          {columns.map((column) => {
            const active = sort?.columnId === column.id
            const Icon = !active ? ChevronsUpDown : sort.direction === 'asc' ? ChevronUp : ChevronDown
            return (
              <th
                key={column.id}
                scope="col"
                aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                style={{ width: column.width === 'auto' ? undefined : column.width, minWidth: column.minWidth }}
                className={cn(
                  'h-row-table border-b border-border text-xs font-medium',
                  cellPad,
                  column.align === 'right' ? 'text-right' : 'text-left',
                )}
              >
                {column.sortable && onSortChange ? (
                  <button
                    type="button"
                    data-focus-inset
                    onClick={() => toggleSort(column.id)}
                    className={cn(
                      'inline-flex items-center gap-1 hover:text-fg',
                      column.align === 'right' && 'flex-row-reverse',
                    )}
                  >
                    {column.header}
                    <Icon aria-hidden size={12} strokeWidth={1.75} className={active ? 'text-accent-text' : ''} />
                  </button>
                ) : (
                  column.header
                )}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const key = rowKey(row, index)
          const selected = selection?.selected.has(key) ?? false
          const tone = rowTone?.(row) ?? null
          const activatable = Boolean(onRowActivate)

          const tr = (
            <tr
              key={key}
              aria-selected={selection ? selected : undefined}
              tabIndex={activatable ? 0 : undefined}
              data-focus-inset
              onClick={() => {
                if (selection) {
                  const next = new Set(selection.mode === 'single' ? [] : selection.selected)
                  if (selected && selection.mode === 'multi') next.delete(key)
                  else next.add(key)
                  selection.onChange(next)
                }
                onRowActivate?.(row, index)
              }}
              onKeyDown={(event) => {
                if (!activatable) return
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onRowActivate?.(row, index)
                }
              }}
              className={cn(
                rowHeight,
                'border-b border-border transition-colors duration-[120ms]',
                tone ? ROW_TONE[tone] : '',
                activatable && 'cursor-pointer',
                selected ? 'bg-selected' : 'hover:bg-hover',
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.id}
                  className={cn(
                    cellPad,
                    column.align === 'right' ? 'text-right' : 'text-left',
                    column.mono && 'font-mono text-xs',
                    column.truncate !== false && 'max-w-0 truncate',
                  )}
                >
                  {column.cell(row, index)}
                </td>
              ))}
            </tr>
          )

          if (!onRowContextMenu) return tr
          return (
            <ContextMenu key={key} items={() => onRowContextMenu(row)}>
              {tr}
            </ContextMenu>
          )
        })}
        {streaming ? (
          <tr className={rowHeight}>
            <td colSpan={columns.length} className={cellPad}>
              <Skeleton variant="text" delayMs={0} />
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  )
}
