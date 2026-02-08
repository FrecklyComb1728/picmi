import { parseAuthCookieValue } from '../server/utils/auth-cookie.js'

const getAuthUsername = (req) => {
  const token = req.cookies?.['picmi.auth']
  return parseAuthCookieValue(token)?.u ?? null
}

const requireAuth = (options = {}) => {
  return async (req, res, next) => {
    try {
      if (getAuthUsername(req)) return next()

      if (typeof options.allow === 'function' && (await options.allow(req))) return next()

      res.status(401).json({ code: 40101, message: '未登录', data: null })
    } catch (error) {
      next(error)
    }
  }
}

const requireAdmin = () => {
  return async (req, res, next) => {
    try {
      const username = getAuthUsername(req)
      if (!username) return res.status(401).json({ code: 40101, message: '未登录', data: null })
      const store = req.app.locals.store
      const admin = await store.getAdminUsername()
      if (!admin) return res.status(403).json({ code: 40301, message: '未初始化管理员', data: null })
      if (username !== admin) return res.status(403).json({ code: 40301, message: '无权限', data: null })
      next()
    } catch (error) {
      next(error)
    }
  }
}

export { getAuthUsername, requireAdmin, requireAuth }
