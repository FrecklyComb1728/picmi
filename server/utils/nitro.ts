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

export const isLoggedIn = (event: H3Event) => {
  const value = getCookie(event, 'picmi.auth')
  return Boolean(parseAuthCookieValue(value))
}

export const requireAuth = async (event: H3Event, allow?: () => boolean | Promise<boolean>) => {
  if (isLoggedIn(event)) return null
  if (allow && (await allow())) return null
  return fail(event, 401, 40101, '未登录')
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
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return raw
  return `http://${raw}`
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
    const res = await fetch(url, options)
    const payload = await res.json().catch(() => null)
    return { res, payload, error: null as any }
  } catch (error: any) {
    return { res: null as any, payload: null, error }
  }
}

export const pickEnabledPicmiNode = (nodes: any[]) => {
  const list = Array.isArray(nodes) ? nodes : []
  const enabled = list.filter((node) => node && node.enabled !== false)
  return enabled.find((node) => String(node?.type ?? 'picmi-node') === 'picmi-node') ?? null
}
