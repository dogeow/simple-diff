import { spawn } from 'child_process'
import { createServer } from 'vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

async function startRenderer() {
  const server = await createServer({
    configFile: resolve(root, 'vite.config.renderer.ts'),
  })
  await server.listen()
  return server
}

function buildWatch(configFile, label) {
  return new Promise((resolvePromise) => {
    const proc = spawn('npx', ['vite', 'build', '--watch', '--config', configFile], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    })

    let resolved = false

    proc.stdout.on('data', (data) => {
      const text = data.toString()
      if (!resolved && text.includes('built in')) {
        resolved = true
        resolvePromise(proc)
      }
    })

    proc.stderr.on('data', (data) => {
      const text = data.toString()
      if (text.trim()) {
        process.stderr.write(`[${label}] ${text}`)
      }
    })
  })
}

function startElectron() {
  const electronPath = resolve(root, 'node_modules/.bin/electron')
  const mainPath = resolve(root, 'dist/main/index.js')

  const proc = spawn(electronPath, [mainPath], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: 'http://localhost:5173',
    },
  })

  proc.on('close', (code) => {
    process.exit(code ?? 0)
  })

  return proc
}

async function main() {
  console.log('[dev] Starting renderer dev server...')
  await startRenderer()
  console.log('[dev] Renderer ready at http://localhost:5173')

  console.log('[dev] Building preload (watch)...')
  await buildWatch(resolve(root, 'vite.config.preload.ts'), 'preload')
  console.log('[dev] Preload ready')

  console.log('[dev] Building main (watch)...')
  await buildWatch(resolve(root, 'vite.config.main.ts'), 'main')
  console.log('[dev] Main ready')

  console.log('[dev] Starting Electron...')
  startElectron()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
