import { Router } from 'express'
import multer from 'multer'
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { requireAuth } from '../middleware/auth.js'
import { expressOk, expressFail } from '../server/utils/http.js'
import { normalizePath, resolvePath, toUrlPath } from '../server/utils/paths.js'
import { rootDir } from '../server/config.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

const sanitizeSingleName = (value) => {
  const raw = String(value ?? '').trim()
  const name = raw.replace(/\\/g, '/').split('/').pop() ?? ''
  if (!name || name === '.' || name === '..') return null
  if (name.includes('/') || name.includes('\\')) return null
  if (name.includes('\0')) return null
  if (name.length > 255) return null
  return name
}

const isAllowedImageName = (name) => {
  return true
}

const normalizeMaxUploadBytes = (value) => {
  const maxUploadBytesDefault = 20 * 1024 * 1024
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return maxUploadBytesDefault
  return Math.max(1 * 1024 * 1024, Math.floor(parsed))
}

const listEntries = async (root, currentPath) => {
  const { target, normalized } = resolvePath(root, currentPath)
  if (!fsSync.existsSync(target)) return { path: normalized, items: [] }
  const stat = await fs.stat(target)
  if (!stat.isDirectory()) return { path: normalized, items: [] }

  const entries = await fs.readdir(target, { withFileTypes: true })
  const items = []

  for (const entry of entries) {
    const entryPath = path.join(target, entry.name)
    const relative = normalized.replace(/^\/+/, '')
    const entryUrlPath = toUrlPath(path.posix.join('/uploads', relative, entry.name))
    if (entry.isDirectory()) {
      items.push({ type: 'folder', name: entry.name, path: normalizePath(path.posix.join(normalized, entry.name)) })
    } else if (entry.isFile()) {
      const info = await fs.stat(entryPath)
      items.push({
        type: 'image',
        name: entry.name,
        path: normalizePath(path.posix.join(normalized, entry.name)),
        url: entryUrlPath,
        size: info.size,
        uploadedAt: info.mtime.toISOString()
      })
    }
  }

  return { path: normalized, items }
}

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true })
}

const copyRecursive = async (from, to) => {
  const stat = await fs.stat(from)
  if (stat.isDirectory()) {
    await ensureDir(to)
    const items = await fs.readdir(from)
    for (const item of items) await copyRecursive(path.join(from, item), path.join(to, item))
    return
  }
  await ensureDir(path.dirname(to))
  await fs.copyFile(from, to)
}

const removeRecursive = async (target) => {
  if (!fsSync.existsSync(target)) return
  const stat = await fs.stat(target)
  if (stat.isDirectory()) {
    const items = await fs.readdir(target)
    for (const item of items) await removeRecursive(path.join(target, item))
    await fs.rmdir(target)
    return
  }
  await fs.unlink(target)
}

const hasStorageAvailable = async (store) => {
  const config = await store.getConfig()
  const enableLocalStorage = config?.enableLocalStorage === true
  const nodes = Array.isArray(config?.nodes) ? config.nodes : []
  const hasEnabledNode = nodes.some((node) => node && node.enabled !== false)
  return enableLocalStorage || hasEnabledNode
}

router.get('/images/list', requireAuth({
  allow: async (req) => {
    const store = req.app.locals.store
    const list = await store.getPublicPaths()
    const current = normalizePath(req.query?.path ?? '/')
    return list.includes(current)
  }
}), async (req, res, next) => {
  try {
    const root = path.resolve(rootDir, req.app.locals.config.storageRoot)
    const currentPath = normalizePath(req.query?.path ?? '/')
    const data = await listEntries(root, currentPath)
    return expressOk(res, data)
  } catch (error) {
    next(error)
  }
})

router.get('/images/exists', requireAuth(), async (req, res, next) => {
  try {
    const root = path.resolve(rootDir, req.app.locals.config.storageRoot)
    const currentPath = normalizePath(req.query?.path ?? '/')
    const filename = String(req.query?.filename ?? '')
    if (!filename) return expressFail(res, 400, 40001, '参数错误')
    const { target } = resolvePath(root, path.posix.join(currentPath, filename))
    const exists = fsSync.existsSync(target)
    return expressOk(res, { exists })
  } catch (error) {
    next(error)
  }
})

router.post('/images/mkdir', requireAuth(), async (req, res, next) => {
  try {
    const root = path.resolve(rootDir, req.app.locals.config.storageRoot)
    const { path: currentPath, name } = req.body ?? {}
    const safeName = sanitizeSingleName(name)
    if (!safeName) return expressFail(res, 400, 40001, '参数错误')
    
    const { target } = resolvePath(root, path.posix.join(normalizePath(currentPath ?? '/'), safeName))
    if (fsSync.existsSync(target)) return expressFail(res, 409, 40901, '文件夹已存在')
    
    await ensureDir(target)
    return expressOk(res, null)
  } catch (error) {
    next(error)
  }
})

router.post('/images/upload', requireAuth(), upload.single('file'), async (req, res, next) => {
  try {
    const store = req.app.locals.store
    if (!(await hasStorageAvailable(store))) return expressFail(res, 400, 40002, '请先配置存储节点或启用本地存储')
    const config = await store.getConfig()
    const maxUploadBytes = normalizeMaxUploadBytes(config?.maxUploadBytes)
    const root = path.resolve(rootDir, req.app.locals.config.storageRoot)
    const currentPath = normalizePath(req.body?.path ?? '/')
    const override = String(req.body?.override ?? '0') === '1'
    const file = req.file
    if (!file) return expressFail(res, 400, 40001, '文件为空')
    const safeName = sanitizeSingleName(file.originalname)
    if (!safeName) return expressFail(res, 400, 40001, '文件名不合法')
    if (Number(file.size) > maxUploadBytes) return expressFail(res, 413, 41301, '文件过大')
    const { target } = resolvePath(root, path.posix.join(currentPath, safeName))
    if (!override && fsSync.existsSync(target)) return expressFail(res, 409, 40901, '文件已存在')
    await ensureDir(path.dirname(target))
    await fs.writeFile(target, file.buffer)
    return expressOk(res, null)
  } catch (error) {
    next(error)
  }
})

router.post('/images/upload-base64', requireAuth(), async (req, res, next) => {
  try {
    const store = req.app.locals.store
    if (!(await hasStorageAvailable(store))) return expressFail(res, 400, 40002, '请先配置存储节点或启用本地存储')
    const config = await store.getConfig()
    const maxUploadBytes = normalizeMaxUploadBytes(config?.maxUploadBytes)
    const root = path.resolve(rootDir, req.app.locals.config.storageRoot)
    const { path: currentPath, filename, base64 } = req.body ?? {}
    if (!filename || !base64) return expressFail(res, 400, 40001, '参数错误')
    const safeName = sanitizeSingleName(filename)
    if (!safeName) return expressFail(res, 400, 40001, '文件名不合法')
    const { target } = resolvePath(root, path.posix.join(normalizePath(currentPath ?? '/'), safeName))
    const data = String(base64).includes(',') ? String(base64).split(',')[1] : String(base64)
    const approx = Math.floor((String(data).length * 3) / 4)
    if (approx > maxUploadBytes) return expressFail(res, 413, 41301, '文件过大')
    await ensureDir(path.dirname(target))
    await fs.writeFile(target, Buffer.from(data, 'base64'))
    return expressOk(res, null)
  } catch (error) {
    next(error)
  }
})

router.post('/images/delete', requireAuth(), async (req, res, next) => {
  try {
    const root = path.resolve(rootDir, req.app.locals.config.storageRoot)
    const { paths } = req.body ?? {}
    if (!Array.isArray(paths)) return expressFail(res, 400, 40001, '参数错误')
    for (const p of paths) {
      const { target } = resolvePath(root, p)
      await removeRecursive(target)
    }
    return expressOk(res, null)
  } catch (error) {
    next(error)
  }
})

router.post('/images/rename', requireAuth(), async (req, res, next) => {
  try {
    const root = path.resolve(rootDir, req.app.locals.config.storageRoot)
    const { path: current, newName } = req.body ?? {}
    const safeName = sanitizeSingleName(newName)
    if (!current || !safeName) return expressFail(res, 400, 40001, '参数错误')
    const { target, normalized } = resolvePath(root, current)
    const nextNormalized = path.posix.join(path.posix.dirname(normalized), safeName)
    const next = resolvePath(root, nextNormalized).target
    await fs.rename(target, next)
    return expressOk(res, null)
  } catch (error) {
    next(error)
  }
})

router.post('/images/move', requireAuth(), async (req, res, next) => {
  try {
    const root = path.resolve(rootDir, req.app.locals.config.storageRoot)
    const { toPath, items } = req.body ?? {}
    if (!Array.isArray(items)) return expressFail(res, 400, 40001, '参数错误')
    const dest = normalizePath(toPath ?? '/')
    for (const item of items) {
      const from = resolvePath(root, item.path).target
      const target = resolvePath(root, path.posix.join(dest, path.basename(from))).target
      await ensureDir(path.dirname(target))
      await fs.rename(from, target)
    }
    return expressOk(res, null)
  } catch (error) {
    next(error)
  }
})

router.post('/images/copy', requireAuth(), async (req, res, next) => {
  try {
    const root = path.resolve(rootDir, req.app.locals.config.storageRoot)
    const { toPath, items } = req.body ?? {}
    if (!Array.isArray(items)) return expressFail(res, 400, 40001, '参数错误')
    const dest = normalizePath(toPath ?? '/')
    for (const item of items) {
      const from = resolvePath(root, item.path).target
      const target = resolvePath(root, path.posix.join(dest, path.basename(from))).target
      await copyRecursive(from, target)
    }
    return expressOk(res, null)
  } catch (error) {
    next(error)
  }
})

router.post('/images/public', requireAuth(), async (req, res, next) => {
  try {
    const store = req.app.locals.store
    const current = normalizePath(req.body?.path ?? '/')
    const list = await store.getPublicPaths()
    const enabled = !list.includes(current)
    await store.setPublicPath(current, enabled)
    return expressOk(res, { enabled })
  } catch (error) {
    next(error)
  }
})

router.get('/images/public-status', requireAuth(), async (req, res, next) => {
  try {
    const store = req.app.locals.store
    const current = normalizePath(req.query?.path ?? '/')
    const list = await store.getPublicPaths()
    return expressOk(res, { enabled: list.includes(current) })
  } catch (error) {
    next(error)
  }
})

export const basePath = '/api'
export { router }
