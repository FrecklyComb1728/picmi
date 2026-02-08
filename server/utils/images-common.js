export const sanitizeSingleNameBasic = (value) => {
  const raw = String(value ?? '').trim()
  const name = raw.replace(/\\/g, '/').split('/').pop() ?? ''
  if (!name || name === '.' || name === '..') return null
  if (name.includes('/') || name.includes('\\')) return null
  if (name.includes('\0')) return null
  if (name.length > 255) return null
  return name
}

export const normalizeMaxUploadBytesBasic = (value) => {
  const maxUploadBytesDefault = 20 * 1024 * 1024
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return maxUploadBytesDefault
  return Math.max(1 * 1024 * 1024, Math.floor(parsed))
}
