import type { CompareHistoryEntry, FileEntry, SourceConfig, SSHConfig } from '@shared/types'

/**
 * 浏览器预览（`npm run dev:ui`）使用的固定数据。
 * 目标：不依赖 Tauri 后端也能渲染全部界面。
 * 目录树与文件内容在 `./mock-tree` 中。
 */

export const MOCK_LEFT_ROOT = '/Users/demo/projects/acme-web'
export const MOCK_RIGHT_ROOT = '/Users/demo/projects/acme-web-release'

export const MOCK_LEFT_SOURCE: SourceConfig = { type: 'local', path: MOCK_LEFT_ROOT }
export const MOCK_RIGHT_SOURCE: SourceConfig = { type: 'local', path: MOCK_RIGHT_ROOT }

/** 同步到右时必定失败的路径，用于验证 `status: 'failed'` 的展示。 */
export const MOCK_SYNC_FAILURE_PATH = 'server/.env.lock'

export const MOCK_PRIVATE_KEY_PATH = '/Users/demo/.ssh/id_ed25519'

export type MockSide = 'left' | 'right'

export const NOW = Date.now()
export const DAY_MS = 24 * 60 * 60 * 1000

export function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

// ─── 对比历史 ─────────────────────────────────────────────────

export const MOCK_HISTORY: readonly CompareHistoryEntry[] = [
  {
    id: 'history-1',
    timestamp: NOW - 12 * 60 * 1000,
    leftLabel: 'acme-web',
    rightLabel: 'acme-web-release',
    leftSource: MOCK_LEFT_SOURCE,
    rightSource: MOCK_RIGHT_SOURCE,
    stats: { total: 120, equal: 62, different: 26, leftOnly: 13, rightOnly: 15 },
  },
  {
    id: 'history-2',
    timestamp: NOW - 3 * 60 * 60 * 1000,
    leftLabel: 'acme-web',
    rightLabel: 'deploy@10.0.3.21:/srv/www/acme',
    leftSource: MOCK_LEFT_SOURCE,
    rightSource: { type: 'sftp', configId: 'ssh-staging', path: '/srv/www/acme' },
    stats: { total: 96, equal: 71, different: 18, leftOnly: 7, rightOnly: 0 },
  },
  {
    id: 'history-3',
    timestamp: NOW - DAY_MS,
    leftLabel: 'docs',
    rightLabel: 'docs-archive',
    leftSource: { type: 'local', path: '/Users/demo/projects/docs' },
    rightSource: { type: 'local', path: '/Users/demo/archive/docs' },
    stats: { total: 41, equal: 33, different: 5, leftOnly: 3, rightOnly: 0 },
  },
  {
    id: 'history-4',
    timestamp: NOW - 2 * DAY_MS,
    leftLabel: 'acme-api',
    rightLabel: 'ubuntu@10.0.3.44:/opt/acme-api',
    leftSource: { type: 'local', path: '/Users/demo/projects/acme-api' },
    rightSource: { type: 'sftp', configId: 'ssh-prod', path: '/opt/acme-api' },
    stats: { total: 208, equal: 190, different: 11, leftOnly: 5, rightOnly: 2 },
  },
  {
    id: 'history-5',
    timestamp: NOW - 5 * DAY_MS,
    leftLabel: 'assets',
    rightLabel: 'assets-cdn',
    leftSource: { type: 'local', path: '/Users/demo/projects/acme-web/assets' },
    rightSource: { type: 'local', path: '/Volumes/cdn/assets' },
    stats: { total: 64, equal: 64, different: 0, leftOnly: 0, rightOnly: 0 },
  },
  {
    id: 'history-6',
    timestamp: NOW - 9 * DAY_MS,
    leftLabel: 'acme-web',
    rightLabel: 'acme-web-hotfix',
    leftSource: MOCK_LEFT_SOURCE,
    rightSource: { type: 'local', path: '/Users/demo/projects/acme-web-hotfix' },
    stats: { total: 118, equal: 101, different: 12, leftOnly: 4, rightOnly: 1 },
  },
]

// ─── SFTP ────────────────────────────────────────────────────

export const MOCK_SSH_CONFIGS: readonly SSHConfig[] = [
  {
    id: 'ssh-staging',
    label: '预发布 staging',
    host: '10.0.3.21',
    port: 22,
    username: 'deploy',
    authType: 'privateKey',
    defaultPath: '/srv/www/acme',
  },
  {
    id: 'ssh-prod',
    label: '生产 prod-01',
    host: '10.0.3.44',
    port: 2222,
    username: 'ubuntu',
    authType: 'password',
    defaultPath: '/opt/acme-api',
  },
]

const REMOTE_DIRECTORIES: Readonly<Record<string, readonly string[]>> = {
  '/': ['home', 'opt', 'srv', 'var'],
  '/home': ['deploy', 'ubuntu'],
  '/home/deploy': ['acme-web', 'acme-api', 'backups'],
  '/opt': ['acme-api', 'tools'],
  '/srv': ['www'],
  '/srv/www': ['acme', 'acme-static'],
  '/var': ['log', 'www'],
}

const REMOTE_FALLBACK_DIRECTORIES: readonly string[] = [
  'assets', 'docs', 'public', 'scripts', 'server', 'src', 'tests',
]

export function listMockRemoteEntries(dirPath: string): readonly FileEntry[] {
  const normalized = dirPath === '' ? '/' : dirPath
  const names = REMOTE_DIRECTORIES[normalized] ?? REMOTE_FALLBACK_DIRECTORIES
  const base = normalized === '/' ? '' : normalized

  return names.map((name) => {
    const path = `${base}/${name}`
    const seed = hashString(path)
    return {
      name,
      path,
      isDirectory: true,
      size: 0,
      mtime: NOW - (seed % 60) * DAY_MS,
    }
  })
}
