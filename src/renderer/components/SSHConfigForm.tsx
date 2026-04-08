import { useState } from 'react'
import type { SSHConfig, SSHConfigInput, SSHAuthType } from '../../../shared/types'

interface SSHConfigFormProps {
  readonly initial?: SSHConfig
  readonly onSave: (config: SSHConfigInput) => Promise<void>
  readonly onCancel: () => void
}

export default function SSHConfigForm({ initial, onSave, onCancel }: SSHConfigFormProps) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [host, setHost] = useState(initial?.host ?? '')
  const [port, setPort] = useState(initial?.port ?? 22)
  const [username, setUsername] = useState(initial?.username ?? '')
  const [authType, setAuthType] = useState<SSHAuthType>(initial?.authType ?? 'password')
  const [password, setPassword] = useState('')
  const [privateKeyPath, setPrivateKeyPath] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [defaultPath, setDefaultPath] = useState(initial?.defaultPath ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleBrowseKey = async () => {
    const result = await window.api.selectFile()
    if (result.success && result.data) {
      setPrivateKeyPath(result.data)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!label || !host || !username) {
      setError('请填写标签、主机和用户名')
      return
    }

    setSaving(true)
    setError(null)

    try {
      await onSave({
        id: initial?.id,
        label,
        host,
        port,
        username,
        authType,
        defaultPath: defaultPath || undefined,
        password: authType === 'password' ? password : undefined,
        privateKeyPath: authType === 'privateKey' ? privateKeyPath : undefined,
        passphrase: authType === 'privateKey' ? passphrase || undefined : undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="标签" value={label} onChange={setLabel} placeholder="My Server" />
        <Field label="主机" value={host} onChange={setHost} placeholder="192.168.1.100" />
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-400">端口</label>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
            className="rounded border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-blue-500"
          />
        </div>
        <Field label="用户名" value={username} onChange={setUsername} placeholder="root" />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-400">认证方式</label>
        <select
          value={authType}
          onChange={(e) => setAuthType(e.target.value as SSHAuthType)}
          className="rounded border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-blue-500"
        >
          <option value="password">密码</option>
          <option value="privateKey">SSH Key</option>
        </select>
      </div>

      {authType === 'password' && (
        <Field label="密码" value={password} onChange={setPassword} type="password" />
      )}

      {authType === 'privateKey' && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-400">私钥路径</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={privateKeyPath}
                onChange={(e) => setPrivateKeyPath(e.target.value)}
                placeholder="~/.ssh/id_rsa"
                className="flex-1 rounded border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 placeholder-neutral-500 outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleBrowseKey}
                className="rounded bg-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-600"
              >
                浏览
              </button>
            </div>
          </div>
          <Field label="密钥密码（可选）" value={passphrase} onChange={setPassphrase} type="password" />
        </>
      )}

      <Field label="默认路径（可选）" value={defaultPath} onChange={setDefaultPath} placeholder="/home/user" />

      {error && (
        <div className="rounded border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded bg-neutral-700 px-4 py-1.5 text-sm hover:bg-neutral-600"
        >
          取消
        </button>
      </div>
    </form>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-neutral-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 placeholder-neutral-500 outline-none focus:border-blue-500"
      />
    </div>
  )
}
