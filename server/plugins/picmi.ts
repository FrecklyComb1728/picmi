import fs from 'node:fs/promises'
import path from 'node:path'
import { loadConfig, rootDir } from '../config.js'
import { createLogger } from '../logger.js'
import { buildStore } from '../store.js'
import { NodeMonitor } from '../node-monitor.js'
import { setAuthCookieConfig } from '../utils/auth-cookie.js'

type PicmiContext = {
  config: Awaited<ReturnType<typeof loadConfig>>
  logger: ReturnType<typeof createLogger>
  store: Awaited<ReturnType<typeof buildStore>>
  nodeMonitor: NodeMonitor
}

const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true })
}

export default defineNitroPlugin(async (nitroApp) => {
  const config = await loadConfig()
  setAuthCookieConfig(config.auth)
  await ensureDir(path.resolve(rootDir, 'logs'))
  await ensureDir(path.resolve(rootDir, 'data'))
  await ensureDir(path.resolve(rootDir, config.storageRoot))

  const logger = createLogger(config)
  const store = await buildStore(config)
  const adminExisting = await store.getAdminUsername?.()
  if (!adminExisting) {
    const users = await store.getUsers()
    const first = users.map((u: any) => String(u?.username ?? '').trim()).filter(Boolean).sort()[0] ?? null
    if (first) await store.setAdminUsername(first)
  }

  const nodeMonitor = new NodeMonitor(logger)
  nodeMonitor.start(store)

  const ctx: PicmiContext = { config, logger, store, nodeMonitor }

  nitroApp.hooks.hook('request', (event) => {
    event.context.picmi = ctx
  })

  nitroApp.hooks.hook('close', async () => {
    nodeMonitor.stop()
    await store.close()
  })
})
