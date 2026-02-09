import path from 'path'

const normalizePath = (input) => {
  const raw = typeof input === 'string' ? input : ''
  const clean = `/${raw}`.replace(/\\/g, '/').replace(/\/+/g, '/')
  const parts = []
  for (const seg of clean.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') {
      parts.pop()
      continue
    }
    parts.push(seg)
  }
  return `/${parts.join('/')}`
}

const resolvePath = (root, input) => {
  const normalized = normalizePath(input)
  const target = path.resolve(root, `.${normalized}`)
  const safeRoot = path.resolve(root)
  const safePrefix = safeRoot.endsWith(path.sep) ? safeRoot : `${safeRoot}${path.sep}`
  if (target !== safeRoot && !target.startsWith(safePrefix)) throw new Error('invalid path')
  return { normalized, target }
}

const toUrlPath = (p) => p.replace(/\\/g, '/').replace(/\/+/g, '/')

const sanitizeSingleNameBasic = (value) => {
  const raw = String(value ?? '').trim()
  const name = raw.replace(/\\/g, '/').split('/').pop() ?? ''
  if (!name || name === '.' || name === '..') return null
  if (name.includes('/') || name.includes('\\')) return null
  if (name.includes('\0')) return null
  if (name.length > 255) return null
  return name
}

const normalizeMaxUploadBytesBasic = (value) => {
  const maxUploadBytesDefault = 20 * 1024 * 1024
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return maxUploadBytesDefault
  return Math.max(1 * 1024 * 1024, Math.floor(parsed))
}

const imageExt = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

const isImageFileName = (name) => {
  const ext = path.extname(String(name ?? '')).toLowerCase()
  return imageExt.has(ext)
}

const sniffImageMime = (buf) => {
  if (!buf || buf.length < 12) return null

  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) {
    return 'image/png'
  }

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg'
  }

  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38 && (buf[4] === 0x37 || buf[4] === 0x39) && buf[5] === 0x61) {
    return 'image/gif'
  }

  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'image/webp'
  }

  return null
}

const validateImageUpload = (name, buf) => {
  return { ok: true, message: null, mime: null }
}

const normalizeUploadFileName = (value) => {
  const raw = String(value ?? '')
  if (!raw) return raw
  const recovered = Buffer.from(raw, 'latin1').toString('utf8')
  if (recovered && Buffer.from(recovered, 'utf8').toString('latin1') === raw) return recovered
  return raw
}

export { normalizePath, resolvePath, toUrlPath, sanitizeSingleNameBasic, normalizeMaxUploadBytesBasic, isImageFileName, sniffImageMime, validateImageUpload, normalizeUploadFileName }
