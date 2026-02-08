const formatDate = (value) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${value.getFullYear()}/${pad(value.getMonth() + 1)}/${pad(value.getDate())}-${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
}

const safe = (value) => {
  if (!value) return '-'
  const raw = String(value)
  return raw.replace(/[\r\n]+/g, ' ').slice(0, 2000)
}

const requestLogger = (logger, config) => {
  return (req, res, next) => {
    res.on('finish', () => {
      const trustProxy = config?.trustProxy !== false
      const ipHeader = config?.logIpHeader || 'x-forwarded-for'
      const forwarded = trustProxy ? safe(req.headers[ipHeader]) : '-'
      const ip = safe(req.ip || req.socket?.remoteAddress)
      const time = formatDate(new Date())
      const method = safe(req.method)
      const url = safe(req.originalUrl || req.url)
      const http = safe(req.httpVersion ? `HTTP/${req.httpVersion}` : '')
      const status = res.statusCode
      const bytes = safe(res.getHeader('content-length'))
      const referer = safe(req.headers.referer)
      const ua = safe(req.headers['user-agent'])
      const line = `${ip} - [${time}] "${method} ${url} ${http}" ${status} ${bytes} "${referer}" "${ua}" "${forwarded}"`
      logger.info(line)
    })
    next()
  }
}

export { requestLogger }
