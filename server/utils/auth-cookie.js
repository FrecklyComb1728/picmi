import crypto from 'node:crypto'

let key = crypto.createHash('sha256').update(crypto.randomBytes(32)).digest()
let authMaxAgeMs = 7 * 24 * 60 * 60 * 1000

export const setAuthCookieConfig = (config) => {
  const secret = String(config?.cookieSecret ?? '').trim()
  const maxAgeSecondsRaw = Number(config?.maxAgeSeconds)
  const maxAgeSeconds = Number.isFinite(maxAgeSecondsRaw) ? Math.max(60, Math.floor(maxAgeSecondsRaw)) : 7 * 24 * 60 * 60
  authMaxAgeMs = maxAgeSeconds * 1000

  if (!secret) {
    if (process.env.NODE_ENV === 'production') throw new Error('auth.cookieSecret 未配置')
    key = crypto.createHash('sha256').update(crypto.randomBytes(32)).digest()
    return
  }

  key = crypto.createHash('sha256').update(secret).digest()
}

export const createAuthCookieValue = (payload) => {
  const withExp = { ...payload, exp: Date.now() + authMaxAgeMs }
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(withExp), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, data]).toString('base64url')
}

export const parseAuthCookieValue = (value) => {
  if (!value) return null
  try {
    const raw = Buffer.from(String(value), 'base64url')
    if (raw.length < 29) return null
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const data = raw.subarray(28)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const json = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
    const parsed = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.u !== 'string') return null
    if (typeof parsed.exp !== 'number') return null
    if (Date.now() > parsed.exp) return null
    return parsed
  } catch {
    return null
  }
}
