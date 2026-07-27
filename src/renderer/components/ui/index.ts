// Doge Desktop Design System — shared primitives.
// Contracts: scratchpad/ui/system/PRIMITIVES.md · tokens: styles/tokens.css
//
// Authored in this repo against PRIMITIVES.md rather than copied from
// mysql-compare (that app ships only 9 of these and none of the internals).
// Keep the API identical across the three apps so a future sync is mechanical.

export * from './types'
export {
  useControllable,
  useDelayedFlag,
  useDismiss,
  useFloating,
  useFocusTrap,
  usePortal,
  useRovingTabIndex,
} from './_internal/hooks'

export { Button, IconButton, type ButtonProps, type ButtonVariant, type IconButtonProps } from './button'
export { SplitButton, type SplitButtonProps } from './split-button'
export { Badge, Kbd, StatusDot, type BadgeProps, type KbdProps, type StatusDotProps } from './badge'
export { Input, SearchInput, Textarea, type InputProps, type SearchInputProps, type TextareaProps } from './input'
export { Select, type SelectOption, type SelectProps } from './select'
export { Combobox, type ComboboxProps } from './combobox'
export {
  Checkbox,
  Field,
  RadioGroup,
  Switch,
  type CheckboxProps,
  type FieldProps,
  type RadioGroupProps,
  type SwitchProps,
} from './form'
export {
  ProgressBar,
  Skeleton,
  Spinner,
  type ProgressBarProps,
  type ProgressState,
  type SkeletonProps,
  type SpinnerProps,
} from './feedback'
export { Popover, usePopoverState, type PopoverProps } from './popover'
export { Tooltip, type TooltipProps } from './tooltip'
export {
  ContextMenu,
  DropdownMenu,
  withDangerSeparator,
  type ContextMenuProps,
  type DropdownMenuProps,
} from './menu'
export { Panel, StatTile, Toolbar, type PanelProps, type StatTileProps, type ToolbarProps } from './panel'
export {
  ConfirmDialog,
  Dialog,
  Drawer,
  type ConfirmDialogProps,
  type DialogProps,
  type DialogSize,
  type DrawerProps,
} from './dialog'
export { EmptyState, type EmptyStateProps, type EmptyStateVariant } from './empty-state'
export { ScrollArea, type ScrollAreaProps } from './scroll-area'
export { SplitPane, type SplitPaneProps } from './split-pane'
export {
  TabStrip,
  Tabs,
  ToggleGroup,
  type DocumentTab,
  type TabItem,
  type TabStripProps,
  type TabsProps,
  type ToggleGroupOption,
  type ToggleGroupProps,
} from './tabs'
export { DataTable, type Column, type DataTableProps, type SortState } from './table'
export { TreeRow, type TreeRowProps } from './tree-row'
export {
  CommandPalette,
  matchesQuery,
  type Command,
  type CommandGroup,
  type CommandPaletteProps,
} from './command-palette'
export {
  DiffGutter,
  RuleEditor,
  normalizeRules,
  type DiffGutterProps,
  type DiffKind,
  type RuleEditorProps,
} from './domain'
