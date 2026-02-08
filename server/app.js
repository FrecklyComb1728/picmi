import express from 'express'
import helmet from 'helmet'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { rootDir } from './config.js'
import { pathToFileURL } from 'url'
import { responseTime } from '../middleware/response-time.js'
import { requestLogger } from '../middleware/request-logger.js'
import { errorHandler } from '../middleware/error-handler.js'
import { NodeMonitor } from './node-monitor.js'

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true })
}

const ensureDirectories = async (config) => {
  await ensureDir(path.resolve(rootDir, 'logs'))
  await ensureDir(path.resolve(rootDir, 'data'))
  await ensureDir(path.resolve(rootDir, config.storageRoot))
}

const loadRoutes = async (app) => {
  const routesDir = path.resolve(rootDir, 'routes')
  if (!fsSync.existsSync(routesDir)) return
  const files = (await fs.readdir(routesDir)).filter((file) => file.endsWith('.js'))
  for (const file of files) {
    const mod = await import(pathToFileURL(path.resolve(routesDir, file)).href)
    if (mod?.router && mod?.basePath) app.use(mod.basePath, mod.router)
  }
}

const createApp = async (config, logger, store) => {
  await ensureDirectories(config)

  const app = express()
  app.set('trust proxy', config?.trustProxy ?? 'loopback')
  app.disable('x-powered-by')
  app.locals.config = config
  app.locals.logger = logger
  app.locals.store = store
  app.locals.nodeMonitor = new NodeMonitor(logger)
  app.locals.nodeMonitor.start(store)

  app.use(helmet())
  app.use(compression())
  app.use(express.json({ limit: '20mb' }))
  app.use(express.urlencoded({ extended: true, limit: '20mb' }))
  app.use(cookieParser())
  app.use(responseTime())
  app.use(requestLogger(logger, config))
  app.use(express.static(path.resolve(rootDir, 'public')))

  await loadRoutes(app)

  app.use(errorHandler(logger))
  return app
}

export { createApp }
