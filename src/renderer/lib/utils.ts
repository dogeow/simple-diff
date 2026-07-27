import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge class names so that a caller-supplied `className` always wins over a
 * primitive's own defaults. Every primitive in `components/ui` uses this.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
