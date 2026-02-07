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

export { normalizePath, resolvePath, toUrlPath }
