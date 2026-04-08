import { useState, useEffect } from 'react'
import type { SSHConfig, SSHConfigInput } from '../../../shared/types'
import { useSSHStore } from '../stores/ssh-store'
import SSHConfigForm from '../components/SSHConfigForm'

export default function SSHManagerPage() {
  const { configs, loading, loadConfigs } = useSSHStore()
  const [editing, setEditing] = useState<SSHConfig | null>(null)
  const [creating, setCreating] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    loadConfigs()
  }, [loadConfigs])

  const handleSave = async (input: SSHConfigInput) => {
    const result = await window.api.saveSSHConfig(input)
    if (!result.success) {
      throw new Error(result.error ?? '保存失败')
    }
    setEditing(null)
    setCreating(false)
    await loadConfigs()
  }

  const handleDelete = async (id: string) => {
    const result = await window.api.deleteSSHConfig(id)
    if (result.success) {
      await loadConfigs()
    }
  }

  const handleTest = async (id: string) => {
    setTesting(id)
    setTestResult(null)
    const result = await window.api.testSSHConnection(id)
    setTesting(null)
    const ok = result.success && result.data === true
    setTestResult({
      id,
      ok,
      msg: ok ? '连接成功' : (result.error ?? '连接失败'),
    })
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">SSH 连接管理</h2>
        {!creating && !editing && (
          <button
            onClick={() => setCreating(true)}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
          >
            新建连接
          </button>
        )}
      </div>

      {/* Create / Edit form */}
      {(creating || editing) && (
        <div className="rounded border border-neutral-700 bg-neutral-800/50 p-4">
          <h3 className="mb-3 text-sm font-medium">
            {editing ? `编辑: ${editing.label}` : '新建 SSH 连接'}
          </h3>
          <SSHConfigForm
            initial={editing ?? undefined}
            onSave={handleSave}
            onCancel={() => {
              setEditing(null)
              setCreating(false)
            }}
          />
        </div>
      )}

      {/* Config list */}
      {loading && <div className="text-sm text-neutral-400">加载中...</div>}

      {!loading && configs.length === 0 && !creating && (
        <div className="py-12 text-center text-neutral-500">
          暂无 SSH 连接。点击"新建连接"添加。
        </div>
      )}

      <div className="flex flex-col gap-2">
        {configs.map((config: SSHConfig) => (
          <div
            key={config.id}
            className="flex items-center justify-between rounded border border-neutral-700 bg-neutral-800/50 px-4 py-3"
          >
            <div>
              <div className="text-sm font-medium">{config.label}</div>
              <div className="text-xs text-neutral-400">
                {config.username}@{config.host}:{config.port}
                {config.defaultPath ? ` — ${config.defaultPath}` : ''}
                <span className="ml-2 text-neutral-500">
                  {config.authType === 'password' ? '密码' : 'SSH Key'}
                </span>
              </div>
              {testResult?.id === config.id && (
                <div className={`mt-1 text-xs ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                  {testResult.msg}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleTest(config.id)}
                disabled={testing === config.id}
                className="rounded bg-neutral-700 px-2.5 py-1 text-xs hover:bg-neutral-600 disabled:opacity-50"
              >
                {testing === config.id ? '测试中...' : '测试'}
              </button>
              <button
                onClick={() => {
                  setCreating(false)
                  setEditing(config)
                }}
                className="rounded bg-neutral-700 px-2.5 py-1 text-xs hover:bg-neutral-600"
              >
                编辑
              </button>
              <button
                onClick={() => handleDelete(config.id)}
                className="rounded bg-red-900/50 px-2.5 py-1 text-xs text-red-400 hover:bg-red-900/80"
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
