import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { normalizePath, resolvePath, toUrlPath } from './paths.js'

export const sanitizeSingleName = (value: string) => {
  const raw = String(value ?? '').trim()
  const name = raw.replace(/\\/g, '/').split('/').pop() ?? ''
  if (!name || name === '.' || name === '..') return null
  if (name.includes('/') || name.includes('\\')) return null
  if (name.includes('\0')) return null
  if (name.length > 255) return null
  return name
}

export const isAllowedImageName = (name: string) => {
  return true
}

export const normalizeMaxUploadBytes = (value: unknown) => {
  const maxUploadBytesDefault = 20 * 1024 * 1024
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return maxUploadBytesDefault
  return Math.max(1 * 1024 * 1024, Math.floor(parsed))
}

export const listEntries = async (root: string, currentPath: string) => {
  const { target, normalized } = resolvePath(root, currentPath)
  if (!fsSync.existsSync(target)) return { path: normalized, items: [] as any[] }
  const stat = await fs.stat(target)
  if (!stat.isDirectory()) return { path: normalized, items: [] as any[] }

  const entries = await fs.readdir(target, { withFileTypes: true })
  const items: any[] = []

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

export const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true })
}

export const copyRecursive = async (from: string, to: string) => {
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

export const removeRecursive = async (target: string) => {
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
