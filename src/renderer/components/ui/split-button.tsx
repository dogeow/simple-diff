import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button, IconButton, type ButtonProps } from './button'
import { DropdownMenu } from './menu'
import type { MenuItem } from './types'

export interface SplitButtonProps extends Omit<ButtonProps, 'size'> {
  size?: 'sm' | 'md'
  /** The menu of variants hanging off the primary action. */
  items: MenuItem[]
  menuLabel: string
}

/** Primary action + a menu of variants ("新建对比 ▾"). */
export function SplitButton({
  size = 'md',
  items,
  menuLabel,
  variant = 'primary',
  className,
  children,
  ...rest
}: SplitButtonProps) {
  return (
    <div className={cn('inline-flex items-stretch', className)}>
      <Button {...rest} variant={variant} size={size} className="rounded-r-none">
        {children}
      </Button>
      <DropdownMenu
        items={items}
        trigger={
          <IconButton
            icon={ChevronDown}
            label={menuLabel}
            variant={variant}
            size={size}
            className="ml-px rounded-l-none"
          />
        }
      />
    </div>
  )
}
