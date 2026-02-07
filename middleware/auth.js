import { parseAuthCookieValue } from '../server/utils/auth-cookie.js'

const requireAuth = (options = {}) => {
  return async (req, res, next) => {
    try {
      const token = req.cookies?.['picmi.auth']
      if (parseAuthCookieValue(token)) return next()

      if (typeof options.allow === 'function' && (await options.allow(req))) return next()

      res.status(401).json({ code: 40101, message: '未登录', data: null })
    } catch (error) {
      next(error)
    }
  }
}

export { requireAuth }
