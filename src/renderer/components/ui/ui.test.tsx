// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Badge, Kbd, StatusDot } from './badge'
import { Button, IconButton } from './button'
import { ConfirmDialog, Dialog } from './dialog'
import { DiffGutter, normalizeRules } from './domain'
import { EmptyState } from './empty-state'
import { ProgressBar } from './feedback'
import { Checkbox, Field, Switch } from './form'
import { matchesQuery, type Command } from './command-palette'
import { Tabs, ToggleGroup } from './tabs'
import { Toolbar } from './panel'
import { SplitPane } from './split-pane'

afterEach(() => cleanup())

describe('cn', () => {
  it('lets the caller className win over a primitive default', () => {
    expect(cn('bg-surface p-3', 'bg-canvas')).toBe('p-3 bg-canvas')
  })
})

describe('Button', () => {
  it('defaults to type=button so it never submits a form by accident', () => {
    render(<Button>保存</Button>)
    expect((screen.getByRole('button', { name: '保存' }) as HTMLButtonElement).type).toBe('button')
  })

  it('marks aria-busy while loading but stays clickable (cancellable work)', () => {
    render(<Button loading>对比中</Button>)
    const button = screen.getByRole('button', { name: '对比中' })
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect((button as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('IconButton', () => {
  it('requires a label and exposes it as the accessible name', () => {
    render(<IconButton icon={RefreshCw} label="重新对比" />)
    expect(screen.getByRole('button', { name: '重新对比' })).toBeTruthy()
  })
})

describe('Badge / StatusDot / Kbd', () => {
  it('renders a status dot with the status data attribute', () => {
    const { container } = render(<StatusDot status="running" />)
    expect(container.querySelector('[data-status="running"]')).toBeTruthy()
  })

  it('renders badge content', () => {
    render(<Badge tone="warning">12</Badge>)
    expect(screen.getByText('12')).toBeTruthy()
  })

  it('substitutes Mod for the platform modifier', () => {
    render(<Kbd>Mod+K</Kbd>)
    expect(screen.getByText(/(⌘|Ctrl)\+K/)).toBeTruthy()
  })
})

describe('ProgressBar', () => {
  it('reports a determinate value', () => {
    render(<ProgressBar status="running" value={0.5} />)
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50')
  })

  it('omits aria-valuenow while indeterminate', () => {
    render(<ProgressBar status="running" />)
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBeNull()
  })
})

describe('Field', () => {
  it('wires label, control and error message together', () => {
    render(
      <Field label="左侧路径" error="路径不存在">
        <input />
      </Field>,
    )
    const input = screen.getByLabelText('左侧路径')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const describedBy = input.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)?.textContent).toBe('路径不存在')
  })
})

describe('Checkbox', () => {
  it('supports the indeterminate state a plain checkbox cannot express', () => {
    render(<Checkbox indeterminate label="全选" />)
    expect((screen.getByLabelText('全选') as HTMLInputElement).indeterminate).toBe(true)
  })
})

describe('Switch', () => {
  it('is a real switch role and toggles', async () => {
    function Harness() {
      const [on, setOn] = useState(false)
      return <Switch checked={on} onCheckedChange={setOn} label="自动换行" />
    }
    render(<Harness />)
    const control = screen.getByRole('switch', { name: '自动换行' })
    expect(control.getAttribute('aria-checked')).toBe('false')
    await userEvent.click(control)
    expect(control.getAttribute('aria-checked')).toBe('true')
  })
})

describe('Tabs', () => {
  it('ships tablist / tab ARIA and a single tab stop', () => {
    render(
      <Tabs
        aria-label="视图"
        value="a"
        onValueChange={() => {}}
        items={[
          { value: 'a', label: '分栏' },
          { value: 'b', label: '合并' },
        ]}
      />,
    )
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toHaveLength(1)
  })
})

describe('ToggleGroup', () => {
  it('renders chips with counts and a pressed state', () => {
    render(
      <ToggleGroup
        aria-label="结果筛选"
        variant="chips"
        value="different"
        onValueChange={() => {}}
        options={[
          { value: 'all', label: '全部', count: 120 },
          { value: 'different', label: '不同', count: 8 },
        ]}
      />,
    )
    expect(screen.getByRole('button', { name: /不同/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('120')).toBeTruthy()
  })
})

describe('Toolbar', () => {
  it('always renders its title', () => {
    render(<Toolbar title="目录对比" subtitle="/tmp/a ↔ /tmp/b" />)
    expect(screen.getByRole('heading', { name: '目录对比' })).toBeTruthy()
  })
})

describe('Dialog', () => {
  it('is a labelled modal that traps focus', () => {
    render(
      <Dialog open onOpenChange={() => {}} title="设置">
        <button type="button">内部按钮</button>
      </Dialog>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(document.getElementById(labelledBy!)?.textContent).toBe('设置')
  })

  it('renders nothing when closed', () => {
    render(
      <Dialog open={false} onOpenChange={() => {}} title="设置">
        <span>内容</span>
      </Dialog>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('ConfirmDialog', () => {
  it('focuses Cancel on open so the destructive action is never the default', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="删除文件"
        subject="/tmp/a/readme.md"
        onConfirm={() => {}}
      />,
    )
    expect(document.activeElement?.textContent).toBe('取消')
    expect(screen.getByText('/tmp/a/readme.md')).toBeTruthy()
  })
})

describe('EmptyState', () => {
  it('always renders its required action', () => {
    render(<EmptyState title="尚未选择目录" action={<Button>选择目录</Button>} />)
    expect(screen.getByRole('button', { name: '选择目录' })).toBeTruthy()
  })
})

describe('DiffGutter', () => {
  it('renders the sign glyph, not colour alone', () => {
    const { container } = render(<DiffGutter kind="add" leftNumber={1} rightNumber={2} />)
    expect(container.querySelector('[data-diff="add"]')?.textContent).toContain('+')
    const { container: removed } = render(<DiffGutter kind="del" />)
    expect(removed.querySelector('[data-diff="del"]')?.textContent).toContain('−')
  })
})

/**
 * PRIMITIVES §14。分隔条是纯鼠标控件里最容易被做残的一个：一条 1px 的线既拖不中，
 * 也进不了 Tab 序。这里钉的是「键盘能做到鼠标能做的每一件事」——方向键调宽、
 * `Home`/`End` 到两端、`Enter` 与双击一样复位，以及比例真的落盘。
 */
describe('SplitPane', () => {
  afterEach(() => localStorage.clear())

  it('divider is a real separator carrying its orientation and value', () => {
    render(
      <SplitPane label="调整左右差异栏宽度">
        <div>左</div>
        <div>右</div>
      </SplitPane>,
    )

    const separator = screen.getByRole('separator', { name: '调整左右差异栏宽度' })
    expect(separator.getAttribute('aria-orientation')).toBe('vertical')
    expect(separator.getAttribute('aria-valuenow')).toBe('50')
    expect(separator.tabIndex).toBe(0)
  })

  it('vertical direction reports a horizontal separator', () => {
    render(
      <SplitPane direction="vertical">
        <div>上</div>
        <div>下</div>
      </SplitPane>,
    )
    expect(screen.getByRole('separator').getAttribute('aria-orientation')).toBe('horizontal')
  })

  it('resizes with the arrow keys and jumps to the bounds with Home/End', async () => {
    const user = userEvent.setup()
    render(
      <SplitPane>
        <div>左</div>
        <div>右</div>
      </SplitPane>,
    )

    const separator = screen.getByRole('separator')
    separator.focus()

    await user.keyboard('{ArrowRight}')
    expect(Number(separator.getAttribute('aria-valuenow'))).toBeGreaterThan(50)
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(Number(separator.getAttribute('aria-valuenow'))).toBeLessThan(50)

    // 两端都留出下限，任何一栏都不会被压到 0。
    await user.keyboard('{Home}')
    expect(separator.getAttribute('aria-valuenow')).toBe('10')
    await user.keyboard('{End}')
    expect(separator.getAttribute('aria-valuenow')).toBe('90')
  })

  it('resets to the default ratio on double-click and on Enter', async () => {
    const user = userEvent.setup()
    render(
      <SplitPane>
        <div>左</div>
        <div>右</div>
      </SplitPane>,
    )

    const separator = screen.getByRole('separator')
    separator.focus()

    await user.keyboard('{End}')
    await user.dblClick(separator)
    expect(separator.getAttribute('aria-valuenow')).toBe('50')

    await user.keyboard('{Home}')
    await user.keyboard('{Enter}')
    expect(separator.getAttribute('aria-valuenow')).toBe('50')
  })

  it('persists the ratio per storageKey and restores it on mount', async () => {
    const user = userEvent.setup()
    const { unmount } = render(
      <SplitPane storageKey="unit-split">
        <div>左</div>
        <div>右</div>
      </SplitPane>,
    )

    screen.getByRole('separator').focus()
    await user.keyboard('{End}')
    expect(localStorage.getItem('ds-split:unit-split')).toBe('0.9')

    unmount()
    render(
      <SplitPane storageKey="unit-split">
        <div>左</div>
        <div>右</div>
      </SplitPane>,
    )
    expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe('90')
  })
})

describe('normalizeRules', () => {
  it('trims, drops blanks and de-duplicates', () => {
    expect(normalizeRules(' src/**\n\nlib/** \nsrc/**\n')).toEqual(['src/**', 'lib/**'])
  })
})

describe('matchesQuery', () => {
  const command: Command = {
    id: 'compare.run',
    title: '开始对比',
    group: 'action',
    keywords: 'compare run start',
    perform: () => {},
  }

  it('matches every whitespace-separated token', () => {
    expect(matchesQuery(command, '')).toBe(true)
    expect(matchesQuery(command, '开始')).toBe(true)
    expect(matchesQuery(command, 'compare start')).toBe(true)
    expect(matchesQuery(command, 'compare 同步')).toBe(false)
  })
})

/**
 * chunk 8 把 `ConfirmDialog` 装进了 `Dialog`（历史 / SSH 管理里的删除确认），
 * 也把 `SFTPBrowserDialog` 装进了 `CompareSetupDialog`。叠加层都 portal 到
 * `document.body`，所以下层的 `useDismiss` 并不「包含」上层的节点——修之前，在确认框里
 * 按一下取消会连它的宿主对话框一起关掉。`useDismiss` 现在只让最上面一层响应。
 */
describe('nested overlays', () => {
  function NestedHost({ onOuterChange }: { onOuterChange: (open: boolean) => void }) {
    const [confirmOpen, setConfirmOpen] = useState(false)
    return (
      <>
        <Dialog open onOpenChange={onOuterChange} title="外层对话框">
          <Button onClick={() => setConfirmOpen(true)}>删除</Button>
        </Dialog>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="确认删除？"
          onConfirm={() => undefined}
        />
      </>
    )
  }

  it('answering a nested ConfirmDialog leaves its host dialog open', async () => {
    const onOuterChange = vi.fn()
    const user = userEvent.setup()
    render(<NestedHost onOuterChange={onOuterChange} />)

    await user.click(screen.getByRole('button', { name: '删除' }))
    await user.click(screen.getByRole('button', { name: '取消' }))

    expect(onOuterChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '外层对话框' })).toBeTruthy()
  })

  it('Escape peels exactly one layer', async () => {
    const onOuterChange = vi.fn()
    const user = userEvent.setup()
    render(<NestedHost onOuterChange={onOuterChange} />)

    await user.click(screen.getByRole('button', { name: '删除' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: '确认删除？' })).toBeNull()
    expect(onOuterChange).not.toHaveBeenCalled()

    await user.keyboard('{Escape}')
    expect(onOuterChange).toHaveBeenCalledWith(false)
  })
})
