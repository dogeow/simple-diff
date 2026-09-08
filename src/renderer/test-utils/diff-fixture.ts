import type { DiffTab } from '../stores/app-store'

export function diffFixture(overrides: Partial<DiffTab> = {}): DiffTab {
  return {
    id: 'file.txt', sessionId: 'file-session', fileName: 'file.txt', relativePath: 'file.txt',
    leftSource: { type: 'local', path: '/left' }, rightSource: { type: 'local', path: '/right' },
    leftFullPath: '/left/file.txt', rightFullPath: '/right/file.txt',
    hasLeftFile: true, hasRightFile: true, leftContent: 'left', rightContent: 'right',
    originalLeftContent: 'left', originalRightContent: 'right', loading: false, loadError: null,
    diffResult: { leftLines: [{ type: 'remove', content: 'left', lineNumber: 1 }], rightLines: [{ type: 'add', content: 'right', lineNumber: 1 }] },
    ...overrides,
  }
}
