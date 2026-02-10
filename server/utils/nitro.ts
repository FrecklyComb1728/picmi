import fs from 'node:fs/promises'
import path from 'node:path'
import { getCookie, readBody, setResponseStatus, type H3Event } from 'h3'
import { loadConfig, rootDir } from '../config.js'
import { createLogger } from '../logger.js'
import { buildStore } from '../store.js'
import { parseAuthCookieValue, setAuthCookieConfig } from './auth-cookie.js'
import { NodeMonitor } from '../node-monitor.js'
import { normalizePath } from './paths.js'

type ApiEnvelope<T> = {
  code: number
  message: string
  data: T
}

export const ok = <T>(data: T, message = 'ok'): ApiEnvelope<T> => {
  return { code: 0, message, data }
}

export const fail = (event: H3Event, status: number, code: number, message: string): ApiEnvelope<null> => {
  setResponseStatus(event, status)
  return { code, message, data: null }
}

export const getAuthPayload = (event: H3Event) => {
  const value = getCookie(event, 'picmi.auth')
  return parseAuthCookieValue(value)
}

export const getAuthUsername = (event: H3Event) => {
  return getAuthPayload(event)?.u ?? null
}

export const isLoggedIn = (event: H3Event) => {
  return Boolean(getAuthPayload(event))
}

export const requireAuth = async (event: H3Event, allow?: () => boolean | Promise<boolean>) => {
  if (isLoggedIn(event)) return null
  if (allow && (await allow())) return null
  return fail(event, 401, 40101, '未登录')
}

export const requireAdmin = async (event: H3Event) => {
  const auth = await requireAuth(event)
  if (auth) return auth
  try {
    const picmi = await usePicmi(event)
    const admin = await picmi.store.getAdminUsername()
    const username = getAuthUsername(event)
    if (!admin) return fail(event, 403, 40301, '未初始化管理员')
    if (!username || username !== admin) return fail(event, 403, 40301, '无权限')
    return null
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
}

export const getPicmi = (event: H3Event) => {
  const ctx = (event.context as any)?.picmi
  if (!ctx) return null
  return ctx as {
    config: any
    logger: any
    store: any
    nodeMonitor: any
  }
}

let picmiInit: Promise<{ config: any; logger: any; store: any; nodeMonitor: any }> | null = null
let picmiCached: { config: any; logger: any; store: any; nodeMonitor: any } | null = null

const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true })
}

const initPicmi = async () => {
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
  return { config, logger, store, nodeMonitor }
}

export const usePicmi = async (event: H3Event) => {
  const existing = getPicmi(event)
  if (existing) return existing
  if (picmiCached) {
    ;(event.context as any).picmi = picmiCached
    return picmiCached
  }
  if (!picmiInit) picmiInit = initPicmi()
  picmiCached = await picmiInit
  ;(event.context as any).picmi = picmiCached
  return picmiCached
}

export const readBodySafe = async <T>(event: H3Event) => {
  try {
    return (await readBody(event)) as T
  } catch {
    return null
  }
}

export const normalizeHttpBase = (address: any) => {
  const raw = String(address ?? '').trim()
  if (!raw) return null
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : `http://${raw}`
  try {
    const url = new URL(withScheme)
    if (url.username || url.password) return null
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (process.env.NODE_ENV === 'production') {
      const host = url.hostname.toLowerCase()
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return null
    }
    return url.origin
  } catch {
    return null
  }
}

export const buildNodeAuthHeaders = (node: any): Record<string, string> => {
  const token = String(node?.password ?? '').trim()
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  return headers
}

export const joinNodePath = (root: any, rel: any) => {
  const rootNorm = normalizePath(root || '/')
  const relNorm = normalizePath(rel || '/')
  if (rootNorm === '/') return relNorm
  if (relNorm === '/') return rootNorm
  return normalizePath(`${rootNorm}/${relNorm}`)
}

export const toRelativePath = (fullPath: any, rootPath: any) => {
  const fullNorm = normalizePath(fullPath || '/')
  const rootNorm = normalizePath(rootPath || '/')
  if (rootNorm === '/') return fullNorm
  if (fullNorm === rootNorm) return '/'
  if (fullNorm.startsWith(`${rootNorm}/`)) return normalizePath(fullNorm.slice(rootNorm.length))
  return fullNorm
}

export const fetchNodePayload = async (url: URL, options?: RequestInit) => {
  try {
    const ms = 15_000
    const signal =
      (options as any)?.signal ??
      (typeof (AbortSignal as any)?.timeout === 'function'
        ? (AbortSignal as any).timeout(ms)
        : (() => {
            const controller = new AbortController()
            const t = setTimeout(() => controller.abort(), ms)
            controller.signal.addEventListener('abort', () => clearTimeout(t), { once: true })
            return controller.signal
          })())

    const res = await fetch(url, { redirect: 'error', ...options, signal })
    const payload = await res.json().catch(() => null)
    return { res, payload, error: null as any }
  } catch (error: any) {
    return { res: null as any, payload: null, error }
  }
}

export const readResponseBufferWithLimit = async (res: Response, maxBytes: number) => {
  const lenRaw = res.headers.get('content-length')
  const len = lenRaw ? Number(lenRaw) : 0
  if (Number.isFinite(len) && len > 0 && len > maxBytes) throw new Error('response too large')

  const body: any = (res as any).body
  if (!body?.getReader) return Buffer.from(await res.arrayBuffer())

  const reader = body.getReader()
  const chunks: Buffer[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const buf = Buffer.from(value)
    total += buf.length
    if (total > maxBytes) throw new Error('response too large')
    chunks.push(buf)
  }
  return Buffer.concat(chunks, total)
}

export const pickEnabledPicmiNode = (nodes: any[]) => {
  const list = Array.isArray(nodes) ? nodes : []
  const enabled = list.filter((node) => node && node.enabled !== false)
  return enabled.find((node) => String(node?.type ?? 'picmi-node') === 'picmi-node') ?? null
}

export const listEnabledPicmiNodes = (nodes: any[]) => {
  const list = Array.isArray(nodes) ? nodes : []
  return list.filter((node) => node && node.enabled !== false && String(node?.type ?? 'picmi-node') === 'picmi-node')
}
