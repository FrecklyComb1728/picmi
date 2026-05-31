const encodePathForRaw = (relPath: string) => {
  return String(relPath)
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')
}

const buildRawUrl = (relPath: string) => `/raw/${encodePathForRaw(relPath)}`
const buildThumbUrl = (relPath: string) => `/thumb/${encodePathForRaw(relPath)}`

export { encodePathForRaw, buildRawUrl, buildThumbUrl }