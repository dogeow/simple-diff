import { useState, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { SSHConfig, SSHConfigInput } from '../../../shared/types'
import { useSSHStore } from '../stores/ssh-store'
import SSHConfigForm from '../components/SSHConfigForm'
import { PlusIcon, ServerIcon, TrashIcon } from '../components/Icons'
import { showToast } from '../stores/toast-store'

export default function SSHManagerPage() {
  const { configs, loading, loadConfigs } = useSSHStore(useShallow((state) => ({
    configs: state.configs,
    loading: state.loading,
    loadConfigs: state.loadConfigs,
  })))
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
    showToast({ tone: 'success', message: input.id ? '连接已更新' : '已保存连接', description: input.label || input.host })
  }

  const handleDelete = async (id: string) => {
    const config = configs.find((c) => c.id === id)
    const result = await window.api.deleteSSHConfig(id)
    if (result.success) {
      await loadConfigs()
      showToast({ tone: 'info', message: '已删除连接', description: config?.label ?? id })
    } else {
      showToast({ tone: 'error', message: '删除失败', description: result.error ?? '未知错误' })
    }
  }

  const handleTest = async (id: string) => {
    setTesting(id)
    setTestResult(null)
    const result = await window.api.testSSHConnection(id)
    setTesting(null)
    const ok = result.success && result.data === true
    const msg = ok ? '连接成功' : (result.error ?? '连接失败')
    setTestResult({ id, ok, msg })
    const config = configs.find((c) => c.id === id)
    showToast({
      tone: ok ? 'success' : 'error',
      message: ok ? '连接成功' : '连接失败',
      description: config?.label ?? config?.host ?? id,
    })
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-6 pt-6 pb-8">
        <header className="flex items-end justify-between gap-4 border-b border-neutral-800 pb-4">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-semibold tracking-tight text-neutral-100">SSH 连接管理</h2>
            <p className="text-xs text-neutral-500">
              {loading
                ? '正在加载...'
                : configs.length === 0
                  ? '尚未配置 SSH 连接'
                  : `共 ${configs.length} 个连接配置`}
            </p>
          </div>
          {!creating && !editing && (
            <button
              onClick={() => setCreating(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-500"
            >
              <PlusIcon width={13} height={13} />
              新建连接
            </button>
          )}
        </header>

        {(creating || editing) && (
          <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-100">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-800 text-blue-300">
                <ServerIcon width={12} height={12} />
              </span>
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
          </section>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-neutral-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-neutral-500" />
            加载中...
          </div>
        )}

        {!loading && configs.length === 0 && !creating && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-800 bg-neutral-900/30 py-16 text-center">
            <ServerIcon width={28} height={28} className="text-neutral-700" />
            <p className="text-sm text-neutral-500">暂无 SSH 连接</p>
            <p className="text-xs text-neutral-600">点击"新建连接"添加配置</p>
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          {configs.map((config: SSHConfig) => (
            <div
              key={config.id}
              className="group flex items-center gap-4 rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3.5 transition-colors hover:border-neutral-700 hover:bg-neutral-900/70"
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                testResult?.id === config.id && testResult.ok
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-neutral-800 text-blue-300'
              }`}>
                <ServerIcon width={14} height={14} />
              </span>

              <div className="flex-1 overflow-hidden">
                <div className="flex items-center gap-2">
                  <div className="truncate text-sm font-medium text-neutral-100">{config.label}</div>
                  <span className="shrink-0 rounded bg-neutral-800/80 px-1.5 py-0.5 text-[10px] font-medium uppercase text-neutral-400">
                    {config.authType === 'password' ? '密码' : 'SSH Key'}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-neutral-500">
                  <span>{config.username}@{config.host}:{config.port}</span>
                  {config.defaultPath && (
                    <span className="truncate text-neutral-600" title={config.defaultPath}>
                      默认路径 · {config.defaultPath}
                    </span>
                  )}
                </div>
                {testResult?.id === config.id && (
                  <div className={`mt-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
                    testResult.ok
                      ? 'bg-emerald-500/10 text-emerald-300'
                      : 'bg-rose-500/10 text-rose-300'
                  }`}>
                    {testResult.msg}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 gap-1.5">
                <button
                  onClick={() => handleTest(config.id)}
                  disabled={testing === config.id}
                  className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800/60 px-2.5 py-1.5 text-xs text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {testing === config.id ? (
                    <>
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
                      测试中...
                    </>
                  ) : (
                    <>测试</>
                  )}
                </button>
                <button
                  onClick={() => {
                    setCreating(false)
                    setEditing(config)
                  }}
                  className="rounded-md border border-neutral-700 bg-neutral-800/60 px-2.5 py-1.5 text-xs text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
                >
                  编辑
                </button>
                <button
                  onClick={() => handleDelete(config.id)}
                  aria-label={`删除 ${config.label}`}
                  className="inline-flex items-center gap-1 rounded-md border border-rose-900/40 bg-rose-950/30 px-2.5 py-1.5 text-xs text-rose-300 transition-colors hover:border-rose-800 hover:bg-rose-900/40 hover:text-rose-200"
                >
                  <TrashIcon width={12} height={12} />
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
