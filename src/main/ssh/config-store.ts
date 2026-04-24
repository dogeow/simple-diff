import { safeStorage } from 'electron'
import Store from 'electron-store'
import { randomUUID } from 'crypto'
import type { SSHConfig, SSHConfigInput, SSHConfigInternal } from '@shared/types'

interface StoreSchema {
  sshConfigs: SSHConfigInternal[]
}

const store = new Store<StoreSchema>({
  name: 'ssh-configs',
  defaults: { sshConfigs: [] },
})

function encrypt(value: string | undefined): string | undefined {
  if (!value) return undefined
  if (!safeStorage.isEncryptionAvailable()) return value
  return safeStorage.encryptString(value).toString('base64')
}

function decrypt(value: string | undefined): string | undefined {
  if (!value) return undefined
  if (!safeStorage.isEncryptionAvailable()) return value
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch {
    return value
  }
}

export function listConfigs(): SSHConfig[] {
  const configs = store.get('sshConfigs') ?? []
  // Strip secrets before exposing to renderer
  return configs.map(({ password, privateKeyPath, passphrase, ...rest }) => rest)
}

export function getConfigInternal(id: string): SSHConfigInternal | undefined {
  const configs = store.get('sshConfigs') ?? []
  const config = configs.find((c) => c.id === id)
  if (!config) return undefined
  return {
    ...config,
    password: decrypt(config.password),
    passphrase: decrypt(config.passphrase),
  }
}

export function saveConfig(input: SSHConfigInput): SSHConfig {
  const configs = store.get('sshConfigs') ?? []
  const id = input.id ?? randomUUID()
  const host = input.host.trim()
  const label = input.label.trim() || host
  const username = input.username.trim() || 'root'

  const record: SSHConfigInternal = {
    id,
    label,
    host,
    port: input.port,
    username,
    authType: input.authType,
    defaultPath: input.defaultPath,
    password: encrypt(input.password),
    privateKeyPath: input.privateKeyPath,
    passphrase: encrypt(input.passphrase),
  }

  const idx = configs.findIndex((c) => c.id === id)
  const updated = [...configs]
  if (idx >= 0) {
    updated[idx] = record
  } else {
    updated.push(record)
  }

  store.set('sshConfigs', updated)

  const { password, privateKeyPath, passphrase, ...safe } = record
  return safe
}

export function deleteConfig(id: string): void {
  const configs = store.get('sshConfigs') ?? []
  store.set(
    'sshConfigs',
    configs.filter((c) => c.id !== id),
  )
}
