const errorHandler = (logger) => {
  return (err, req, res, next) => {
    if (res.headersSent) return next(err)
    const status = err?.status ?? 500
    const code = err?.code ?? 1
    const message = err?.message || '服务异常'
    logger.error({ err })
    res.status(status).json({ code, message, data: null })
  }
}

export { errorHandler }
