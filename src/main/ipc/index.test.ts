import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS, type CompareEntry, type CompareRequest, type CompareResult } from '@shared/types'
import type { FileSource } from '../file-source/types'

const mocks = vi.hoisted(() => {
  const ipcHandlers = new Map<string, (...args: any[]) => Promise<unknown>>()

  return {
    ipcHandlers,
    ipcHandle: vi.fn((channel: string, handler: (...args: any[]) => Promise<unknown>) => {
      ipcHandlers.set(channel, handler)
    }),
    createFileSource: vi.fn(),
    compareDirectories: vi.fn(),
    addHistory: vi.fn(),
    listConfigs: vi.fn(),
    saveConfig: vi.fn(),
    deleteConfig: vi.fn(),
    getConfigInternal: vi.fn(),
    disconnect: vi.fn(),
    testConnection: vi.fn(),
    loggerInfo: vi.fn(),
    loggerWarn: vi.fn(),
    loggerError: vi.fn(),
    syncStart: vi.fn(),
    syncPause: vi.fn(),
    syncResume: vi.fn(),
    syncGetSnapshot: vi.fn(),
    syncClear: vi.fn(),
    syncSubscribe: vi.fn(() => vi.fn()),
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.ipcHandle,
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
  shell: {
    showItemInFolder: vi.fn(),
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(),
    getAllWindows: vi.fn(() => []),
  },
}))

vi.mock('../file-source/index', () => ({
  createFileSource: mocks.createFileSource,
}))

vi.mock('../compare/comparator', () => ({
  compareDirectories: mocks.compareDirectories,
}))

vi.mock('../history/history-store', () => ({
  addHistory: mocks.addHistory,
  listHistory: vi.fn(),
  clearHistory: vi.fn(),
  deleteHistory: vi.fn(),
}))

vi.mock('../ssh/config-store', () => ({
  listConfigs: mocks.listConfigs,
  saveConfig: mocks.saveConfig,
  deleteConfig: mocks.deleteConfig,
  getConfigInternal: mocks.getConfigInternal,
}))

vi.mock('../ssh/connection-manager', () => ({
  connectionManager: {
    disconnect: mocks.disconnect,
    testConnection: mocks.testConnection,
  },
}))

vi.mock('../utils/logger', () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    child: vi.fn(() => ({
      info: mocks.loggerInfo,
      warn: mocks.loggerWarn,
      error: mocks.loggerError,
      child: vi.fn(),
    })),
  },
}))

vi.mock('../sync/sync-manager', () => ({
  syncManager: {
    start: mocks.syncStart,
    pause: mocks.syncPause,
    resume: mocks.syncResume,
    getSnapshot: mocks.syncGetSnapshot,
    clear: mocks.syncClear,
    subscribe: mocks.syncSubscribe,
  },
}))

function createMockSource(type: FileSource['type'] = 'local'): FileSource & { dispose: ReturnType<typeof vi.fn> } {
  return {
    type,
    list: vi.fn(async () => []),
    stat: vi.fn(async () => ({ name: '', path: '', isDirectory: false, size: 0, mtime: 0 })),
    readDir: vi.fn(async () => []),
    exists: vi.fn(async () => true),
    readText: vi.fn(async () => ''),
    readFileBuffer: vi.fn(async () => Buffer.alloc(0)),
    hashFile: vi.fn(async () => ''),
    hashFileRange: vi.fn(async () => ''),
    writeText: vi.fn(async () => {}),
    writeFileBuffer: vi.fn(async () => {}),
    ensureDir: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
  }
}

function createRequest(compareId: string): CompareRequest {
  return {
    compareId,
    left: { type: 'local', path: '/left' },
    right: { type: 'local', path: '/right' },
    strategies: ['size'],
    extensionFilter: ['dist'],
  }
}

function createResult(entries: readonly CompareEntry[] = []): CompareResult {
  return {
    entries,
    stats: {
      total: entries.length,
      equal: entries.filter((entry) => entry.state === 'equal').length,
      different: entries.filter((entry) => entry.state === 'different').length,
      leftOnly: entries.filter((entry) => entry.state === 'left_only').length,
      rightOnly: entries.filter((entry) => entry.state === 'right_only').length,
    },
    duration: 25,
  }
}

function createCompareEntry(relativePath: string, state: CompareEntry['state']): CompareEntry {
  return {
    relativePath,
    name: relativePath.split('/').at(-1) ?? relativePath,
    isDirectory: false,
    state,
    left: { name: relativePath, path: relativePath, isDirectory: false, size: 1, mtime: 1 },
    right: { name: relativePath, path: relativePath, isDirectory: false, size: 1, mtime: 1 },
    reasons: [],
  }
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

async function registerHandlers() {
  vi.resetModules()
  mocks.ipcHandlers.clear()
  const module = await import('./index')
  module.registerAllHandlers()
}

function getHandler(channel: string) {
  const handler = mocks.ipcHandlers.get(channel)
  if (!handler) {
    throw new Error(`Handler not registered for ${channel}`)
  }
  return handler
}

beforeEach(async () => {
  vi.clearAllMocks()
  mocks.ipcHandlers.clear()
  await registerHandlers()
})

describe('IPC compare handlers', () => {
  it('runs compare, forwards progress events, enriches history, and disposes sources', async () => {
    const leftSource = createMockSource()
    const rightSource = createMockSource()
    const scanEntries = [createCompareEntry('src/file.txt', 'pending')]
    const updateEntry = createCompareEntry('src/file.txt', 'equal')
    const compareResult = createResult([updateEntry])

    mocks.createFileSource
      .mockResolvedValueOnce(leftSource)
      .mockResolvedValueOnce(rightSource)

    mocks.compareDirectories.mockImplementation(async (options) => {
      options.onEntriesFound?.(scanEntries)
      options.onEntryUpdate?.(updateEntry)
      return compareResult
    })

    const sender = { send: vi.fn() }
    const response = await getHandler(IPC_CHANNELS.COMPARE_RUN)({ sender }, createRequest('compare-success'))

    expect(response).toEqual({
      success: true,
      data: {
        ...compareResult,
        leftSource: { type: 'local', path: '/left' },
        rightSource: { type: 'local', path: '/right' },
      },
    })
    expect(mocks.compareDirectories).toHaveBeenCalledTimes(1)
    expect(mocks.compareDirectories).toHaveBeenCalledWith(expect.objectContaining({
      leftSource,
      rightSource,
      leftRoot: '/left',
      rightRoot: '/right',
      strategies: ['size'],
      extensionFilter: ['dist'],
      signal: expect.any(AbortSignal),
    }))
    expect(sender.send).toHaveBeenNthCalledWith(
      1,
      IPC_CHANNELS.COMPARE_SCAN_COMPLETE,
      'compare-success',
      scanEntries,
    )
    expect(sender.send).toHaveBeenNthCalledWith(
      2,
      IPC_CHANNELS.COMPARE_ENTRY_UPDATE,
      'compare-success',
      updateEntry,
    )
    expect(mocks.addHistory).toHaveBeenCalledWith({
      ...compareResult,
      leftSource: { type: 'local', path: '/left' },
      rightSource: { type: 'local', path: '/right' },
    })
    expect(leftSource.dispose).toHaveBeenCalledTimes(1)
    expect(rightSource.dispose).toHaveBeenCalledTimes(1)
  })

  it('aborts an active compare via COMPARE_CANCEL and suppresses progress events after cancellation', async () => {
    const leftSource = createMockSource()
    const rightSource = createMockSource()
    const sender = { send: vi.fn() }
    const queuedEntry = createCompareEntry('cancelled.txt', 'equal')

    mocks.createFileSource
      .mockResolvedValueOnce(leftSource)
      .mockResolvedValueOnce(rightSource)

    mocks.compareDirectories.mockImplementation(({ signal, onEntriesFound, onEntryUpdate }) =>
      new Promise((_, reject) => {
        signal?.addEventListener('abort', () => {
          onEntriesFound?.([queuedEntry])
          onEntryUpdate?.(queuedEntry)
          reject(new Error('对比已取消'))
        }, { once: true })
      }),
    )

    const runPromise = getHandler(IPC_CHANNELS.COMPARE_RUN)({ sender }, createRequest('compare-cancel'))
    await flushAsyncWork()

    const cancelResponse = await getHandler(IPC_CHANNELS.COMPARE_CANCEL)({ sender }, 'compare-cancel')
    const runResponse = await runPromise

    expect(cancelResponse).toEqual({ success: true, data: undefined })
    expect(runResponse).toEqual({ success: false, error: '对比已取消' })
    expect(sender.send).not.toHaveBeenCalled()
    expect(mocks.addHistory).not.toHaveBeenCalled()
    expect(leftSource.dispose).toHaveBeenCalledTimes(1)
    expect(rightSource.dispose).toHaveBeenCalledTimes(1)
  })

  it('keeps multiple compares for the same sender running concurrently', async () => {
    const firstLeftSource = createMockSource()
    const firstRightSource = createMockSource()
    const secondLeftSource = createMockSource()
    const secondRightSource = createMockSource()

    mocks.createFileSource
      .mockResolvedValueOnce(firstLeftSource)
      .mockResolvedValueOnce(firstRightSource)
      .mockResolvedValueOnce(secondLeftSource)
      .mockResolvedValueOnce(secondRightSource)

    let firstAborted = false
    let resolveFirstCompare: ((value: CompareResult) => void) | null = null
    mocks.compareDirectories
      .mockImplementationOnce(({ signal }) => new Promise((resolve) => {
        signal?.addEventListener('abort', () => {
          firstAborted = true
        }, { once: true })
        resolveFirstCompare = resolve
      }))
      .mockResolvedValueOnce(createResult([createCompareEntry('second.txt', 'equal')]))

    const sender = { send: vi.fn() }

    const firstPromise = getHandler(IPC_CHANNELS.COMPARE_RUN)({ sender }, createRequest('compare-1'))
    await flushAsyncWork()

    const secondResponse = await getHandler(IPC_CHANNELS.COMPARE_RUN)({ sender }, createRequest('compare-2'))

    expect(secondResponse).toEqual({
      success: true,
      data: {
        ...createResult([createCompareEntry('second.txt', 'equal')]),
        leftSource: { type: 'local', path: '/left' },
        rightSource: { type: 'local', path: '/right' },
      },
    })

    resolveFirstCompare?.(createResult([createCompareEntry('first.txt', 'equal')]))
    const firstResponse = await firstPromise

    expect(firstResponse).toEqual({
      success: true,
      data: {
        ...createResult([createCompareEntry('first.txt', 'equal')]),
        leftSource: { type: 'local', path: '/left' },
        rightSource: { type: 'local', path: '/right' },
      },
    })
    expect(firstAborted).toBe(false)
    expect(firstLeftSource.dispose).toHaveBeenCalledTimes(1)
    expect(firstRightSource.dispose).toHaveBeenCalledTimes(1)
    expect(secondLeftSource.dispose).toHaveBeenCalledTimes(1)
    expect(secondRightSource.dispose).toHaveBeenCalledTimes(1)
  })

  it('reruns only the matching compare id when the same sender starts it again', async () => {
    const firstLeftSource = createMockSource()
    const firstRightSource = createMockSource()
    const secondLeftSource = createMockSource()
    const secondRightSource = createMockSource()

    mocks.createFileSource
      .mockResolvedValueOnce(firstLeftSource)
      .mockResolvedValueOnce(firstRightSource)
      .mockResolvedValueOnce(secondLeftSource)
      .mockResolvedValueOnce(secondRightSource)

    let firstAborted = false
    mocks.compareDirectories
      .mockImplementationOnce(({ signal }) => new Promise((_, reject) => {
        signal?.addEventListener('abort', () => {
          firstAborted = true
          reject(new Error('对比已取消'))
        }, { once: true })
      }))
      .mockResolvedValueOnce(createResult([createCompareEntry('rerun.txt', 'equal')]))

    const sender = { send: vi.fn() }

    const firstPromise = getHandler(IPC_CHANNELS.COMPARE_RUN)({ sender }, createRequest('compare-rerun'))
    await flushAsyncWork()

    const secondResponse = await getHandler(IPC_CHANNELS.COMPARE_RUN)({ sender }, createRequest('compare-rerun'))
    const firstResponse = await firstPromise

    expect(firstAborted).toBe(true)
    expect(firstResponse).toEqual({ success: false, error: '对比已取消' })
    expect(secondResponse).toEqual({
      success: true,
      data: {
        ...createResult([createCompareEntry('rerun.txt', 'equal')]),
        leftSource: { type: 'local', path: '/left' },
        rightSource: { type: 'local', path: '/right' },
      },
    })
  })

  it('isolates active compares per sender so another window does not cancel them', async () => {
    const firstLeftSource = createMockSource()
    const firstRightSource = createMockSource()
    const secondLeftSource = createMockSource()
    const secondRightSource = createMockSource()

    mocks.createFileSource
      .mockResolvedValueOnce(firstLeftSource)
      .mockResolvedValueOnce(firstRightSource)
      .mockResolvedValueOnce(secondLeftSource)
      .mockResolvedValueOnce(secondRightSource)

    let resolveFirstCompare: ((value: CompareResult) => void) | null = null
    mocks.compareDirectories
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirstCompare = resolve
      }))
      .mockResolvedValueOnce(createResult([createCompareEntry('second.txt', 'equal')]))

    const senderOne = { send: vi.fn() }
    const senderTwo = { send: vi.fn() }

    const firstPromise = getHandler(IPC_CHANNELS.COMPARE_RUN)({ sender: senderOne }, createRequest('compare-1'))
    await flushAsyncWork()

    const secondResponse = await getHandler(IPC_CHANNELS.COMPARE_RUN)({ sender: senderTwo }, createRequest('compare-2'))

    expect(secondResponse).toEqual({
      success: true,
      data: {
        ...createResult([createCompareEntry('second.txt', 'equal')]),
        leftSource: { type: 'local', path: '/left' },
        rightSource: { type: 'local', path: '/right' },
      },
    })

    resolveFirstCompare?.(createResult([createCompareEntry('first.txt', 'equal')]))
    const firstResponse = await firstPromise

    expect(firstResponse).toEqual({
      success: true,
      data: {
        ...createResult([createCompareEntry('first.txt', 'equal')]),
        leftSource: { type: 'local', path: '/left' },
        rightSource: { type: 'local', path: '/right' },
      },
    })
    expect(firstLeftSource.dispose).toHaveBeenCalledTimes(1)
    expect(firstRightSource.dispose).toHaveBeenCalledTimes(1)
    expect(secondLeftSource.dispose).toHaveBeenCalledTimes(1)
    expect(secondRightSource.dispose).toHaveBeenCalledTimes(1)
  })

  it('cancels only the targeted compare for the requesting sender', async () => {
    const firstLeftSource = createMockSource()
    const firstRightSource = createMockSource()
    const secondLeftSource = createMockSource()
    const secondRightSource = createMockSource()

    mocks.createFileSource
      .mockResolvedValueOnce(firstLeftSource)
      .mockResolvedValueOnce(firstRightSource)
      .mockResolvedValueOnce(secondLeftSource)
      .mockResolvedValueOnce(secondRightSource)

    let firstAborted = false
    let resolveSecondCompare: ((value: CompareResult) => void) | null = null
    mocks.compareDirectories
      .mockImplementationOnce(({ signal }) => new Promise((_, reject) => {
        signal?.addEventListener('abort', () => {
          firstAborted = true
          reject(new Error('对比已取消'))
        }, { once: true })
      }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveSecondCompare = resolve
      }))

    const sender = { send: vi.fn() }

    const firstPromise = getHandler(IPC_CHANNELS.COMPARE_RUN)({ sender }, createRequest('compare-1'))
    const secondPromise = getHandler(IPC_CHANNELS.COMPARE_RUN)({ sender }, createRequest('compare-2'))
    await flushAsyncWork()

    const cancelResponse = await getHandler(IPC_CHANNELS.COMPARE_CANCEL)({ sender }, 'compare-1')
    const firstResponse = await firstPromise

    expect(cancelResponse).toEqual({ success: true, data: undefined })
    expect(firstAborted).toBe(true)
    expect(firstResponse).toEqual({ success: false, error: '对比已取消' })

    resolveSecondCompare?.(createResult([createCompareEntry('second.txt', 'equal')]))
    const secondResponse = await secondPromise

    expect(secondResponse).toEqual({
      success: true,
      data: {
        ...createResult([createCompareEntry('second.txt', 'equal')]),
        leftSource: { type: 'local', path: '/left' },
        rightSource: { type: 'local', path: '/right' },
      },
    })
  })

  it('cancels all compares for the requesting sender when COMPARE_CANCEL has no compare id', async () => {
    const firstLeftSource = createMockSource()
    const firstRightSource = createMockSource()
    const secondLeftSource = createMockSource()
    const secondRightSource = createMockSource()
    const thirdLeftSource = createMockSource()
    const thirdRightSource = createMockSource()

    mocks.createFileSource
      .mockResolvedValueOnce(firstLeftSource)
      .mockResolvedValueOnce(firstRightSource)
      .mockResolvedValueOnce(secondLeftSource)
      .mockResolvedValueOnce(secondRightSource)
      .mockResolvedValueOnce(thirdLeftSource)
      .mockResolvedValueOnce(thirdRightSource)

    let firstAborted = false
    let secondAborted = false
    let resolveThirdCompare: ((value: CompareResult) => void) | null = null
    mocks.compareDirectories
      .mockImplementationOnce(({ signal }) => new Promise((_, reject) => {
        signal?.addEventListener('abort', () => {
          firstAborted = true
          reject(new Error('对比已取消'))
        }, { once: true })
      }))
      .mockImplementationOnce(({ signal }) => new Promise((_, reject) => {
        signal?.addEventListener('abort', () => {
          secondAborted = true
          reject(new Error('对比已取消'))
        }, { once: true })
      }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveThirdCompare = resolve
      }))

    const senderOne = { send: vi.fn() }
    const senderTwo = { send: vi.fn() }

    const firstPromise = getHandler(IPC_CHANNELS.COMPARE_RUN)({ sender: senderOne }, createRequest('compare-1'))
    const secondPromise = getHandler(IPC_CHANNELS.COMPARE_RUN)({ sender: senderOne }, createRequest('compare-2'))
    const thirdPromise = getHandler(IPC_CHANNELS.COMPARE_RUN)({ sender: senderTwo }, createRequest('compare-3'))
    await flushAsyncWork()

    const cancelResponse = await getHandler(IPC_CHANNELS.COMPARE_CANCEL)({ sender: senderOne })
    const firstResponse = await firstPromise
    const secondResponse = await secondPromise

    expect(cancelResponse).toEqual({ success: true, data: undefined })
    expect(firstAborted).toBe(true)
    expect(secondAborted).toBe(true)
    expect(firstResponse).toEqual({ success: false, error: '对比已取消' })
    expect(secondResponse).toEqual({ success: false, error: '对比已取消' })

    resolveThirdCompare?.(createResult([createCompareEntry('third.txt', 'equal')]))
    const thirdResponse = await thirdPromise

    expect(thirdResponse).toEqual({
      success: true,
      data: {
        ...createResult([createCompareEntry('third.txt', 'equal')]),
        leftSource: { type: 'local', path: '/left' },
        rightSource: { type: 'local', path: '/right' },
      },
    })
  })
})
