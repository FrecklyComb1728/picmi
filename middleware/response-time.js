const responseTime = () => {
  return (req, res, next) => {
    const start = process.hrtime.bigint()
    const originalEnd = res.end
    res.end = function end(...args) {
      const diff = Number(process.hrtime.bigint() - start) / 1e6
      res.setHeader('X-Response-Time', `${diff.toFixed(1)}ms`)
      return originalEnd.apply(this, args)
    }
    next()
  }
}

export { responseTime }
