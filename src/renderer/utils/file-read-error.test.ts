import { beforeEach, describe, expect, it } from 'vitest'
import { useSSHStore } from '../stores/ssh-store'
import { formatFileReadErrorForUi } from './file-read-error'

describe('file-read-error', () => {
  beforeEach(() => {
    useSSHStore.setState({
      configs: [
        { id: 'prod', label: '生产服', host: 'prod.example.com', port: 22, username: 'deploy', authType: 'privateKey' },
      ],
      loading: false,
      loadConfigs: async () => undefined,
    })
  })

  it('formats sftp timeout failures into user-friendly text', () => {
    const message = formatFileReadErrorForUi(
      '左侧',
      { type: 'sftp', configId: 'prod', path: '/var/www/api-next' },
      '/var/www/api-next/app/Http/Controllers/Api/Thing/ItemController.php',
      'channel closed',
    )

    expect(message).toContain('左侧SFTP · 生产服文件读取失败')
    expect(message).toContain('读取过程已中断或超时')
  })
})