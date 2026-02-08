import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import dotenv from 'dotenv'

const resolveRootDir = () => {
  const envRoot = String(process.env.PICMI_ROOT || '').trim()
  if (envRoot) return path.resolve(envRoot)
  const cwd = process.cwd()
  if (path.basename(cwd) === '.output') return path.resolve(cwd, '..')
  return path.resolve(cwd)
}

const rootDir = resolveRootDir()

const defaults = {
  port: 5408,
  logLevel: 'INFO',
  logFile: './logs/app.log',
  logIpHeader: 'x-forwarded-for',
  trustProxy: 'loopback',
  storageRoot: './public/uploads',
  auth: {
    cookieSecret: '',
    maxAgeSeconds: 7 * 24 * 60 * 60,
    allowRemoteInit: process.env.NODE_ENV !== 'production'
  },
  database: {
    driver: 'sqlite',
    sqlite: {
      file: './data/sqlite.db'
    },
    mysql: {
      host: '',
      port: 3306,
      user: '',
      password: '',
      database: ''
    },
    postgresql: {
      host: '',
      port: 5432,
      user: '',
      password: '',
      database: '',
      ssl: false
    },
    supabase: {
      url: '',
      serviceRoleKey: ''
    }
  }
}

const loadConfig = async () => {
  if (process.env.NODE_ENV !== 'production') {
    const envPath = path.join(rootDir, '.env.local')
    if (fsSync.existsSync(envPath)) dotenv.config({ path: envPath })
  }

  const configPath = path.join(rootDir, 'config.json')
  const raw = await fs.readFile(configPath, 'utf-8')
  const data = JSON.parse(raw)

  return {
    ...defaults,
    ...data,
    auth: {
      ...defaults.auth,
      ...(data.auth ?? {})
    },
    database: {
      ...defaults.database,
      ...(data.database ?? {}),
      sqlite: { ...defaults.database.sqlite, ...(data.database?.sqlite ?? {}) },
      mysql: { ...defaults.database.mysql, ...(data.database?.mysql ?? {}) },
      postgresql: { ...defaults.database.postgresql, ...(data.database?.postgresql ?? {}) },
      supabase: { ...defaults.database.supabase, ...(data.database?.supabase ?? {}) }
    }
  }
}

export { loadConfig, rootDir }
