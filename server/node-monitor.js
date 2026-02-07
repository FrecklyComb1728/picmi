import net from 'node:net'

const clampNumber = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return num
}

const nowIso = () => new Date().toISOString()

const normalizeHttpBase = (address) => {
  const raw = String(address ?? '').trim()
  if (!raw) return null
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return raw
  return `http://${raw}`
}

const normalizeFtpBase = (address) => {
  const raw = String(address ?? '').trim()
  if (!raw) return null
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return raw
  return `ftp://${raw}`
}

const joinUrl = (base, pathname) => {
  const url = new URL(base)
  const basePath = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`
  url.pathname = new URL(pathname.replace(/^\/+/, ''), `http://x${basePath}`).pathname
  return url
}

const readSseStream = async (body, onData, signal) => {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of body) {
    if (signal?.aborted) return
    buffer += decoder.decode(chunk, { stream: true })
    let idx = buffer.indexOf('\n\n')
    while (idx >= 0) {
      const raw = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      idx = buffer.indexOf('\n\n')
      const lines = raw.split(/\r?\n/)
      const dataLines = []
      for (const line of lines) {
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
      }
      if (!dataLines.length) continue
      const data = dataLines.join('\n').trim()
      if (!data) continue
      await onData(data)
    }
  }
}

const tryFetch = async (url, options, timeoutMs) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const startedAt = Date.now()
    const res = await fetch(url, { ...options, signal: controller.signal })
    const latencyMs = Date.now() - startedAt
    return { res, latencyMs }
  } finally {
    clearTimeout(timer)
  }
}

const buildBasicAuth = (username, password) => {
  const u = String(username ?? '')
  const p = String(password ?? '')
  if (!u && !p) return null
  const token = Buffer.from(`${u}:${p}`, 'utf-8').toString('base64')
  return `Basic ${token}`
}

class NodeMonitor {
  constructor(logger) {
    this.logger = logger
    this.byId = new Map()
    this.tasks = new Map()
    this.running = false
    this.store = null
    this.syncTimer = null
  }

  start(store) {
    this.store = store
    if (this.running) return
    this.running = true
    this.syncTimer = setInterval(() => {
      this.sync().catch(() => {})
    }, 5000)
    this.sync().catch(() => {})
  }

  stop() {
    this.running = false
    if (this.syncTimer) clearInterval(this.syncTimer)
    this.syncTimer = null
    for (const task of this.tasks.values()) task.stop()
    this.tasks.clear()
  }

  snapshot() {
    const out = {}
    for (const [id, value] of this.byId.entries()) out[id] = value
    return out
  }

  ensureRecord(node) {
    const id = String(node?.id ?? '')
    if (!id) return null
    if (this.byId.has(id)) return this.byId.get(id)
    const init = {
      id,
      type: String(node?.type ?? 'picmi-node'),
      enabled: Boolean(node?.enabled),
      online: false,
      reachable: false,
      latencyMs: null,
      cpuPercent: null,
      memoryUsed: null,
      memoryTotal: null,
      diskUsed: null,
      diskTotal: null,
      bandwidthUp: null,
      bandwidthDown: null,
      updatedAt: null,
      message: null
    }
    this.byId.set(id, init)
    return init
  }

  setStatus(node, patch) {
    const record = this.ensureRecord(node)
    if (!record) return
    Object.assign(record, patch)
    record.enabled = Boolean(node?.enabled)
    record.type = String(node?.type ?? record.type)
    if (patch.updatedAt == null) record.updatedAt = nowIso()
  }

  async sync() {
    if (!this.running || !this.store) return
    const config = await this.store.getConfig()
    const nodes = Array.isArray(config?.nodes) ? config.nodes : []
    const existing = new Set(nodes.map((n) => String(n?.id ?? '')).filter(Boolean))

    for (const [id, task] of this.tasks.entries()) {
      if (!existing.has(id)) {
        task.stop()
        this.tasks.delete(id)
        this.byId.delete(id)
      }
    }

    for (const node of nodes) {
      const id = String(node?.id ?? '')
      if (!id) continue
      this.ensureRecord(node)
      if (node?.enabled === false) {
        const existingTask = this.tasks.get(id)
        if (existingTask) {
          existingTask.stop()
          this.tasks.delete(id)
        }
        this.setStatus(node, { online: false, reachable: false, message: 'disabled' })
        continue
      }
      if (this.tasks.has(id)) continue
      const type = String(node?.type ?? 'picmi-node')
      if (type === 'picmi-node') this.tasks.set(id, this.startPicmiNode(node))
      else if (type === 'webdav') this.tasks.set(id, this.startWebdav(node))
      else if (type === 'ftp') this.tasks.set(id, this.startFtp(node))
      else this.tasks.set(id, this.startGenericHttp(node))
    }
  }

  startPicmiNode(node) {
    const id = String(node?.id ?? '')
    let stopped = false
    let controller = null
    const loop = async () => {
      let delayMs = 500
      while (!stopped) {
        const base = normalizeHttpBase(node?.address)
        if (!base) {
          this.setStatus(node, { online: false, reachable: false, message: 'invalid address' })
          await new Promise((r) => setTimeout(r, 2000))
          continue
        }
        const streamUrl = joinUrl(base, '/api/status/stream')
        const headers = {}
        const token = String(node?.password ?? '').trim()
        if (token) headers.authorization = `Bearer ${token}`

        controller = new AbortController()
        const signal = controller.signal

        try {
          const startedAt = Date.now()
          const res = await fetch(streamUrl, { headers, signal })
          if (!res.ok || !res.body) {
            this.setStatus(node, { online: false, reachable: false, message: `http ${res.status}` })
            await new Promise((r) => setTimeout(r, delayMs))
            delayMs = Math.min(delayMs * 2, 10000)
            continue
          }
          this.setStatus(node, { reachable: true, online: true, latencyMs: Date.now() - startedAt, message: null })
          delayMs = 500
          await readSseStream(
            res.body,
            async (data) => {
              let parsed = null
              try {
                parsed = JSON.parse(data)
              } catch {
                return
              }
              const cpuPercent = clampNumber(parsed?.cpuPercent ?? parsed?.cpu)
              const memoryUsed = clampNumber(parsed?.memoryUsed ?? parsed?.memUsed)
              const memoryTotal = clampNumber(parsed?.memoryTotal ?? parsed?.memTotal)
              const diskUsed = clampNumber(parsed?.diskUsed)
              const diskTotal = clampNumber(parsed?.diskTotal)
              const bandwidthUp = clampNumber(parsed?.bandwidthUp ?? parsed?.up)
              const bandwidthDown = clampNumber(parsed?.bandwidthDown ?? parsed?.down)
              const latencyMs = clampNumber(parsed?.latencyMs)

              this.setStatus(node, {
                online: true,
                reachable: true,
                latencyMs: latencyMs ?? this.byId.get(id)?.latencyMs ?? null,
                cpuPercent,
                memoryUsed,
                memoryTotal,
                diskUsed,
                diskTotal,
                bandwidthUp,
                bandwidthDown,
                message: null,
                updatedAt: nowIso()
              })
            },
            signal
          )
          this.setStatus(node, { online: false, reachable: false, message: 'disconnected' })
          await new Promise((r) => setTimeout(r, delayMs))
          delayMs = Math.min(delayMs * 2, 10000)
        } catch (error) {
          if (signal.aborted) return
          this.setStatus(node, { online: false, reachable: false, message: String(error?.message ?? 'error') })
          await new Promise((r) => setTimeout(r, delayMs))
          delayMs = Math.min(delayMs * 2, 10000)
        }
      }
    }
    loop().catch(() => {})
    return {
      stop: () => {
        stopped = true
        if (controller) controller.abort()
      }
    }
  }

  startWebdav(node) {
    let stopped = false
    let timer = null
    const tick = async () => {
      if (stopped) return
      const base = normalizeHttpBase(node?.address)
      if (!base) {
        this.setStatus(node, { online: false, reachable: false, message: 'invalid address' })
        return
      }
      const headers = {}
      const auth = buildBasicAuth(node?.username, node?.password)
      if (auth) headers.authorization = auth
      try {
        const { res, latencyMs } = await tryFetch(base, { method: 'OPTIONS', headers, redirect: 'manual' }, 4000)
        const reachable = Boolean(res)
        const okStatus = res.status >= 200 && res.status < 500
        this.setStatus(node, {
          online: okStatus,
          reachable,
          latencyMs,
          cpuPercent: null,
          memoryUsed: null,
          memoryTotal: null,
          diskUsed: null,
          diskTotal: null,
          bandwidthUp: null,
          bandwidthDown: null,
          message: `http ${res.status}`,
          updatedAt: nowIso()
        })
      } catch (error) {
        this.setStatus(node, { online: false, reachable: false, message: String(error?.message ?? 'error'), updatedAt: nowIso() })
      }
    }
    const loop = async () => {
      while (!stopped) {
        await tick()
        await new Promise((r) => {
          timer = setTimeout(r, 10000)
        })
      }
    }
    loop().catch(() => {})
    return {
      stop: () => {
        stopped = true
        if (timer) clearTimeout(timer)
      }
    }
  }

  startFtp(node) {
    let stopped = false
    let timer = null

    const tick = async () => {
      const base = normalizeFtpBase(node?.address)
      if (!base) {
        this.setStatus(node, { online: false, reachable: false, message: 'invalid address' })
        return
      }
      let url = null
      try {
        url = new URL(base)
      } catch {
        this.setStatus(node, { online: false, reachable: false, message: 'invalid address' })
        return
      }
      const host = url.hostname
      const port = url.port ? Number(url.port) : 21
      const startedAt = Date.now()
      await new Promise((resolve) => {
        const socket = net.createConnection({ host, port })
        const onDone = (online, message) => {
          socket.removeAllListeners()
          socket.destroy()
          const latencyMs = Date.now() - startedAt
          this.setStatus(node, {
            online,
            reachable: online,
            latencyMs,
            cpuPercent: null,
            memoryUsed: null,
            memoryTotal: null,
            diskUsed: null,
            diskTotal: null,
            bandwidthUp: null,
            bandwidthDown: null,
            message,
            updatedAt: nowIso()
          })
          resolve()
        }
        socket.setTimeout(4000)
        socket.once('connect', () => onDone(true, 'tcp ok'))
        socket.once('timeout', () => onDone(false, 'timeout'))
        socket.once('error', (err) => onDone(false, String(err?.message ?? 'error')))
      })
    }

    const loop = async () => {
      while (!stopped) {
        await tick().catch(() => {})
        await new Promise((r) => {
          timer = setTimeout(r, 10000)
        })
      }
    }
    loop().catch(() => {})
    return {
      stop: () => {
        stopped = true
        if (timer) clearTimeout(timer)
      }
    }
  }

  startGenericHttp(node) {
    let stopped = false
    let timer = null
    const tick = async () => {
      const base = normalizeHttpBase(node?.address)
      if (!base) {
        this.setStatus(node, { online: false, reachable: false, message: 'invalid address' })
        return
      }
      try {
        const { res, latencyMs } = await tryFetch(base, { method: 'HEAD', redirect: 'manual' }, 4000)
        const okStatus = res.status >= 200 && res.status < 500
        this.setStatus(node, {
          online: okStatus,
          reachable: true,
          latencyMs,
          cpuPercent: null,
          memoryUsed: null,
          memoryTotal: null,
          diskUsed: null,
          diskTotal: null,
          bandwidthUp: null,
          bandwidthDown: null,
          message: `http ${res.status}`,
          updatedAt: nowIso()
        })
      } catch (error) {
        this.setStatus(node, { online: false, reachable: false, message: String(error?.message ?? 'error'), updatedAt: nowIso() })
      }
    }
    const loop = async () => {
      while (!stopped) {
        await tick()
        await new Promise((r) => {
          timer = setTimeout(r, 10000)
        })
      }
    }
    loop().catch(() => {})
    return {
      stop: () => {
        stopped = true
        if (timer) clearTimeout(timer)
      }
    }
  }
}

export { NodeMonitor }

