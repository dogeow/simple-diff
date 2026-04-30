import { useId, useState } from 'react'
import type { SSHConfig, SSHConfigInput, SSHAuthType } from '../../../shared/types'
import { CheckIcon, FolderIcon } from './Icons'

interface SSHConfigFormProps {
  readonly initial?: SSHConfig
  readonly onSave: (config: SSHConfigInput) => Promise<void>
  readonly onCancel: () => void
}

const AUTH_TYPES: { value: SSHAuthType; label: string }[] = [
  { value: 'password', label: '密码' },
  { value: 'privateKey', label: 'SSH Key' },
]

export default function SSHConfigForm({ initial, onSave, onCancel }: SSHConfigFormProps) {
  const portId = useId()
  const privateKeyPathId = useId()
  const [label, setLabel] = useState(initial?.label ?? '')
  const [host, setHost] = useState(initial?.host ?? '')
  const [port, setPort] = useState(initial?.port ?? 22)
  const [username, setUsername] = useState(initial?.username || 'root')
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
    const trimmedHost = host.trim()
    const resolvedLabel = label.trim() || trimmedHost
    const resolvedUsername = username.trim() || 'root'

    if (!trimmedHost) {
      setError('请填写主机')
      return
    }

    setSaving(true)
    setError(null)

    try {
      await onSave({
        id: initial?.id,
        label: resolvedLabel,
        host: trimmedHost,
        port,
        username: resolvedUsername,
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
          <label htmlFor={portId} className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">端口</label>
          <input
            id={portId}
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
            className="rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100 outline-none transition-colors hover:border-neutral-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
          />
        </div>
        <Field label="用户名" value={username} onChange={setUsername} placeholder="root" />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">认证方式</span>
        <div className="inline-flex w-fit overflow-hidden rounded-md border border-neutral-700 bg-neutral-800">
          {AUTH_TYPES.map((auth) => (
            <button
              key={auth.value}
              type="button"
              onClick={() => setAuthType(auth.value)}
              aria-pressed={authType === auth.value}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                authType === auth.value
                  ? 'bg-blue-600 text-white'
                  : 'text-neutral-300 hover:bg-neutral-700'
              } ${auth.value === 'privateKey' ? 'border-l border-neutral-700' : ''}`}
            >
              {auth.label}
            </button>
          ))}
        </div>
      </div>

      {authType === 'password' && (
        <Field label="密码" value={password} onChange={setPassword} type="password" />
      )}

      {authType === 'privateKey' && (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor={privateKeyPathId} className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">私钥路径</label>
            <div className="flex gap-2">
              <input
                id={privateKeyPathId}
                type="text"
                value={privateKeyPath}
                onChange={(e) => setPrivateKeyPath(e.target.value)}
                placeholder="~/.ssh/id_rsa"
                className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 font-mono text-sm text-neutral-100 placeholder-neutral-500 outline-none transition-colors hover:border-neutral-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
              />
              <button
                type="button"
                onClick={handleBrowseKey}
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-750"
              >
                <FolderIcon width={13} height={13} />
                浏览
              </button>
            </div>
          </div>
          <Field label="密钥密码（可选）" value={passphrase} onChange={setPassphrase} type="password" />
        </>
      )}

      <Field label="默认路径（可选）" value={defaultPath} onChange={setDefaultPath} placeholder="/home/user" />

      {error && (
        <div className="rounded-md border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? (
            <>
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              保存中...
            </>
          ) : (
            <>
              <CheckIcon width={13} height={13} />
              保存
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-neutral-700 bg-neutral-800/60 px-4 py-1.5 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800"
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
  const inputId = useId()

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">{label}</label>
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100 placeholder-neutral-500 outline-none transition-colors hover:border-neutral-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
      />
    </div>
  )
}
