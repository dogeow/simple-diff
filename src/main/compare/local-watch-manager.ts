import type { WebContents } from 'electron'
import { watch, type FSWatcher } from 'chokidar'
import { relative, resolve } from 'path'
import { IPC_CHANNELS, type CompareLocalWatchRequest } from '@shared/types'
import { trimTrailingSeparators } from '@shared/source-path'
import { logger } from '../utils/logger'
import { safeSendToWebContents } from '../utils/safe-ipc'

const localWatchLogger = logger.child('compare-watch')

const DIRTY_FLUSH_INTERVAL_MS = 250
const DIRTY_PATH_LIMIT = 256

interface LocalWatchRoot {
  readonly rootPath: string
  readonly label: 'left' | 'right'
}

interface LocalWatchSession {
  readonly sessionId: string
  readonly watchers: FSWatcher[]
  readonly dirtyPaths: Set<string>
  flushTimer: NodeJS.Timeout | null
}

const sessionsBySender = new WeakMap<WebContents, Map<string, LocalWatchSession>>()
const senderCleanupInstalled = new WeakSet<WebContents>()

function getSenderSessions(sender: WebContents): Map<string, LocalWatchSession> {
  let sessions = sessionsBySender.get(sender)
  if (!sessions) {
    sessions = new Map<string, LocalWatchSession>()
    sessionsBySender.set(sender, sessions)
  }
  return sessions
}

function normalizeLocalRootPath(rootPath: string): string {
  return trimTrailingSeparators(resolve(rootPath))
}

function normalizeDirtyRelativePath(relativePath: string): string {
  if (!relativePath || relativePath === '.') {
    return ''
  }

  return relativePath.split(/[\\/]+/).filter(Boolean).join('/')
}

function resolveDirtyRelativePath(rootPath: string, targetPath: string): string | null {
  const normalizedTargetPath = resolve(targetPath)
  const relativePath = relative(rootPath, normalizedTargetPath)

  if (!relativePath || relativePath === '.') {
    return ''
  }

  if (relativePath.startsWith('..')) {
    return null
  }

  return normalizeDirtyRelativePath(relativePath)
}

function collectLocalWatchRoots(request: CompareLocalWatchRequest): readonly LocalWatchRoot[] {
  const roots: LocalWatchRoot[] = []

  if (request.left.type === 'local') {
    roots.push({ label: 'left', rootPath: normalizeLocalRootPath(request.left.path) })
  }
  if (request.right.type === 'local') {
    roots.push({ label: 'right', rootPath: normalizeLocalRootPath(request.right.path) })
  }

  return roots.filter((root, index) => roots.findIndex((candidate) => candidate.rootPath === root.rootPath) === index)
}

async function closeWatchSession(session: LocalWatchSession): Promise<void> {
  if (session.flushTimer) {
    clearTimeout(session.flushTimer)
    session.flushTimer = null
  }

  await Promise.all(session.watchers.map(async (watcher) => {
    try {
      await watcher.close()
    } catch (error) {
      localWatchLogger.warn(`关闭本地监听失败: ${error instanceof Error ? error.message : error}`)
    }
  }))
  session.watchers.length = 0
  session.dirtyPaths.clear()
}

async function stopAllLocalWatchSessions(sender: WebContents): Promise<void> {
  const sessions = sessionsBySender.get(sender)
  if (!sessions) {
    return
  }

  await Promise.all(Array.from(sessions.values(), (session) => closeWatchSession(session)))
  sessions.clear()
  sessionsBySender.delete(sender)
}

function ensureSenderCleanup(sender: WebContents): void {
  if (senderCleanupInstalled.has(sender)) {
    return
  }

  senderCleanupInstalled.add(sender)
  const cleanup = (): void => {
    void stopAllLocalWatchSessions(sender)
  }

  sender.once('destroyed', cleanup)
  sender.once('render-process-gone', cleanup)
}

export class LocalCompareWatchManager {
  async start(sender: WebContents, request: CompareLocalWatchRequest): Promise<void> {
    ensureSenderCleanup(sender)
    await this.stop(sender, request.sessionId)

    const localRoots = collectLocalWatchRoots(request)
    if (localRoots.length === 0) {
      localWatchLogger.info(`[${request.sessionId}] 无本地目录，无需启动监听`)
      return
    }

    const session: LocalWatchSession = {
      sessionId: request.sessionId,
      watchers: [],
      dirtyPaths: new Set<string>(),
      flushTimer: null,
    }

    const flushDirtyPaths = (): void => {
      if (session.flushTimer) {
        clearTimeout(session.flushTimer)
        session.flushTimer = null
      }

      if (session.dirtyPaths.size === 0) {
        return
      }

      const eventPaths = session.dirtyPaths.has('')
        ? ['']
        : Array.from(session.dirtyPaths).sort((a, b) => a.length - b.length || a.localeCompare(b))

      session.dirtyPaths.clear()
      const sent = safeSendToWebContents(sender, IPC_CHANNELS.COMPARE_LOCAL_DIRTY, request.sessionId, eventPaths)
      if (!sent) {
        localWatchLogger.warn(`[${request.sessionId}] 渲染进程不可用，停止本地监听`)
        void this.stop(sender, request.sessionId)
        return
      }

      localWatchLogger.info(`[${request.sessionId}] 发送本地变更 ${eventPaths.length} 项`)
    }

    const queueDirtyPath = (relativePath: string): void => {
      if (session.dirtyPaths.has('')) {
        return
      }

      if (relativePath === '' || session.dirtyPaths.size >= DIRTY_PATH_LIMIT) {
        session.dirtyPaths.clear()
        session.dirtyPaths.add('')
      } else {
        session.dirtyPaths.add(relativePath)
      }

      if (!session.flushTimer) {
        session.flushTimer = setTimeout(flushDirtyPaths, DIRTY_FLUSH_INTERVAL_MS)
      }
    }

    for (const root of localRoots) {
      const watcher = watch(root.rootPath, {
        ignoreInitial: true,
        persistent: true,
        ignorePermissionErrors: true,
        awaitWriteFinish: {
          stabilityThreshold: 200,
          pollInterval: 50,
        },
      })

      watcher.on('all', (_eventName, targetPath) => {
        const relativePath = resolveDirtyRelativePath(root.rootPath, targetPath)
        if (relativePath == null) {
          return
        }

        localWatchLogger.info(`[${request.sessionId}] 本地目录变化 ${root.label}:${relativePath || '.'}`)
        queueDirtyPath(relativePath)
      })

      watcher.on('error', (error) => {
        localWatchLogger.warn(`[${request.sessionId}] 本地监听异常 ${root.label}:${root.rootPath} error=${error instanceof Error ? error.message : error}`)
        queueDirtyPath('')
      })

      session.watchers.push(watcher)
    }

    getSenderSessions(sender).set(request.sessionId, session)
    localWatchLogger.info(`[${request.sessionId}] 已启动本地监听 roots=${localRoots.map((root) => `${root.label}:${root.rootPath}`).join('，')}`)
  }

  async stop(sender: WebContents, sessionId?: string): Promise<void> {
    const sessions = sessionsBySender.get(sender)
    if (!sessions) {
      return
    }

    if (!sessionId) {
      await stopAllLocalWatchSessions(sender)
      return
    }

    const session = sessions.get(sessionId)
    if (!session) {
      return
    }

    await closeWatchSession(session)
    sessions.delete(sessionId)
    if (sessions.size === 0) {
      sessionsBySender.delete(sender)
    }
    localWatchLogger.info(`[${sessionId}] 已停止本地监听`)
  }
}

export const localCompareWatchManager = new LocalCompareWatchManager()