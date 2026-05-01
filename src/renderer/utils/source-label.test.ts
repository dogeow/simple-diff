import { describe, expect, it } from 'vitest'
import type { SSHConfig, SourceConfig } from '../../../shared/types'
import { formatComparePairLabel, formatCompareTabTitleFromSources, formatSourceTag, isSameSourceConfig } from './source-label'

const sshConfigs: readonly SSHConfig[] = [
  {
    id: 'prod',
    label: '生产服',
    host: 'prod.example.com',
    port: 22,
    username: 'deploy',
    authType: 'privateKey',
  },
  {
    id: 'staging',
    label: '预发服',
    host: 'staging.example.com',
    port: 22,
    username: 'deploy',
    authType: 'privateKey',
  },
]

describe('source-label', () => {
  it('formats sftp source tags and compare pair labels with config labels', () => {
    const left: SourceConfig = { type: 'sftp', configId: 'prod', path: '/var/www/api-next' }
    const right: SourceConfig = { type: 'sftp', configId: 'staging', path: '/var/www/api' }

    expect(formatSourceTag(left, sshConfigs)).toBe('SFTP · 生产服')
    expect(formatComparePairLabel(left, right, sshConfigs)).toBe('生产服:/var/www/api-next ↔ 预发服:/var/www/api')
    expect(formatCompareTabTitleFromSources(left, right, sshConfigs)).toBe('生产服:api-next ↔ 预发服:api')
  })

  it('compares source configs including sftp config id', () => {
    expect(isSameSourceConfig(
      { type: 'local', path: '/tmp/a' },
      { type: 'local', path: '/tmp/a' },
    )).toBe(true)

    expect(isSameSourceConfig(
      { type: 'sftp', configId: 'prod', path: '/tmp/a' },
      { type: 'sftp', configId: 'staging', path: '/tmp/a' },
    )).toBe(false)
  })
})