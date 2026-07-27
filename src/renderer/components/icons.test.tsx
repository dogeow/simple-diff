// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import ToastContainer from './ToastContainer'
import CompareTreeRow from './CompareTreeRow'
import { showToast, useToastStore } from '../stores/toast-store'
import type { TreeNode } from '../utils/tree-utils'

const ALLOWED_ICON_SIZES = [12, 14, 16, 20]

/** Every renderer source, read verbatim, so the §6 rules can be asserted statically. */
const SOURCES = Object.entries(
  import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>,
)
  .filter(([file]) => !/\.test\.tsx?$/.test(file))
  .map(([file, text]) => ({ file, text }))

function node(name: string, isDirectory: boolean): TreeNode {
  return {
    name,
    relativePath: name,
    isDirectory,
    entry: {
      relativePath: name,
      name,
      isDirectory,
      state: 'different',
      left: { name, path: `/left/${name}`, isDirectory, size: 1, mtime: 1 },
      right: { name, path: `/right/${name}`, isDirectory, size: 2, mtime: 2 },
      reasons: [],
    },
    children: [],
    depth: 0,
  }
}

const DIRECTORY_NODE = node('src', true)
const FILE_NODE = node('main.ts', false)

function renderRow(target: TreeNode) {
  return render(
    <CompareTreeRow
      node={target}
      side="merged"
      index={0}
      setSize={1}
      expanded={false}
      loading={false}
      dirty={false}
      selected={false}
      focused={false}
      onSelect={() => {}}
      onToggle={() => {}}
      onActivate={() => {}}
      buildActions={() => []}
    />,
  )
}

afterEach(() => {
  cleanup()
  useToastStore.setState({ toasts: [] })
})

describe('icon system (DESIGN-SYSTEM §6)', () => {
  it('draws lucide glyphs at strokeWidth 1.75, an allowed size, and aria-hidden', () => {
    renderRow(DIRECTORY_NODE)

    const icons = Array.from(document.querySelectorAll('svg.lucide'))

    expect(icons.length).toBeGreaterThan(0)
    for (const icon of icons) {
      expect(icon.getAttribute('stroke-width')).toBe('1.75')
      expect([12, 14, 16, 20]).toContain(Number(icon.getAttribute('width')))
      expect(icon.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('uses the tree-disclosure and file/folder glyphs rather than hand-written paths', () => {
    renderRow(DIRECTORY_NODE)

    expect(document.querySelector('svg.lucide-chevron-right')).not.toBeNull()
    expect(document.querySelector('svg.lucide-folder')).not.toBeNull()

    cleanup()
    renderRow(FILE_NODE)

    expect(document.querySelector('svg.lucide-file')).not.toBeNull()
  })

  it('pairs each toast tone with its reserved status glyph', () => {
    showToast({ tone: 'warning', message: '截断' })
    render(<ToastContainer />)

    expect(document.querySelector('svg.lucide-triangle-alert')).not.toBeNull()
    expect(screen.getByText('截断')).not.toBeNull()
  })
})

describe('icon system — source invariants', () => {
  it('reads the whole renderer tree', () => {
    // Guards the two scans below against a glob that silently matches nothing.
    expect(SOURCES.length).toBeGreaterThan(50)
    expect(SOURCES.some((s) => s.file.endsWith('/CompareTreeRow.tsx'))).toBe(true)
  })

  it('ships no hand-written SVG and no Icons module', () => {
    const handWritten = SOURCES.filter((s) => s.text.includes('<svg') || /from '[^']*\/Icons'/.test(s.text))

    expect(handWritten.map((s) => s.file)).toEqual([])
  })

  it('renders every lucide glyph at strokeWidth 1.75 and an allowed size', () => {
    const offenders: string[] = []

    for (const { file, text } of SOURCES) {
      const importBlock = text.match(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'lucide-react'/s)
      if (!importBlock) continue

      const names = importBlock[1]
        .split(',')
        .map((part: string) => part.trim())
        .filter((part: string) => part.length > 0 && !part.startsWith('type '))
        .map((part: string) => part.split(/\s+as\s+/).pop() as string)

      for (const name of names) {
        const usage = new RegExp(`<${name}(\\s[^>]*?)?/?>`, 'gs')
        let match: RegExpExecArray | null
        while ((match = usage.exec(text)) !== null) {
          const attrs = match[1] ?? ''
          const line = text.slice(0, match.index).split('\n').length
          if (!/strokeWidth=\{1\.75\}/.test(attrs)) offenders.push(`${file}:${line} <${name}> missing strokeWidth={1.75}`)
          for (const [, size] of attrs.matchAll(/size=\{[^}]*?(\d+)[^}]*?\}/g)) {
            if (!ALLOWED_ICON_SIZES.includes(Number(size))) offenders.push(`${file}:${line} <${name}> size ${size}`)
          }
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
