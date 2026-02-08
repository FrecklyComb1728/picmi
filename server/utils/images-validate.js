import path from 'node:path'

const imageExt = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

export const isImageFileName = (name) => {
  const ext = path.extname(String(name ?? '')).toLowerCase()
  return imageExt.has(ext)
}

export const sniffImageMime = (buf) => {
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

export const validateImageUpload = (name, buf) => {
  const safeName = String(name ?? '')
  if (!isImageFileName(safeName)) return { ok: true, mime: null }
  const mime = sniffImageMime(buf)
  if (!mime) return { ok: false, message: '文件内容不是合法图片', mime: null }
  return { ok: true, mime }
}
