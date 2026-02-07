import cluster from 'cluster'
import os from 'os'
import http from 'http'
import fs from 'fs/promises'
import path from 'path'
import { loadConfig } from './config.js'
import { createLogger } from './logger.js'
import { buildStore } from './store.js'
import { createApp } from './app.js'
import { setAuthCookieConfig } from './utils/auth-cookie.js'
const startWorker = async (config, logger) => {
  const store = await buildStore(config)
  const app = await createApp(config, logger, store)
  const server = http.createServer(app)
  server.listen(config.port, () => {
    logger.info(`server listening on ${config.port}`)
  })
}

const start = async () => {
  const config = await loadConfig()
  setAuthCookieConfig(config.auth)
  if (config.logFile) {
    await fs.mkdir(path.dirname(path.resolve(config.logFile)), { recursive: true })
  }
  const logger = createLogger(config)

  if (process.env.NODE_ENV === 'production' && cluster.isPrimary) {
    const count = os.cpus().length
    for (let i = 0; i < count; i += 1) cluster.fork()
    cluster.on('exit', () => cluster.fork())
    logger.info(`cluster started with ${count} workers`)
    return
  }

  await startWorker(config, logger)
}

start()
