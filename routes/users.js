import { Router } from 'express'
import { getAuthUsername, requireAdmin, requireAuth } from '../middleware/auth.js'
import { hashPassword } from '../server/utils/hash.js'
import { expressOk, expressFail } from '../server/utils/http.js'

const router = Router()

router.get('/users', requireAdmin(), async (req, res, next) => {
  try {
    const store = req.app.locals.store
    const users = await store.getUsers()
    return expressOk(res, { users })
  } catch (error) {
    next(error)
  }
})

router.post('/users', async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {}
    if (!username) return expressFail(res, 400, 40001, '参数错误')
    if (typeof password !== 'string' && password !== undefined) return expressFail(res, 400, 40001, '参数错误')

    const store = req.app.locals.store
    const existingUsers = await store.getUsers()
    const normalized = String(username).trim()

    if (existingUsers.length === 0) {
      if (!password || !password.trim()) return expressFail(res, 400, 40001, '参数错误')
      const allowRemoteInit = req.app.locals.config?.auth?.allowRemoteInit === true
      const trustProxy = req.app.locals.config?.trustProxy !== false
      const xff = trustProxy ? String(req.headers['x-forwarded-for'] ?? '').trim() : ''
      const remoteAddress = String(req.socket?.remoteAddress ?? '')
      const isLocal = remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1'
      if (xff && !allowRemoteInit) return expressFail(res, 403, 40301, '无权限')
      if (!isLocal && !allowRemoteInit) return expressFail(res, 403, 40301, '无权限')
      await store.upsertUser(normalized, hashPassword(String(password)))
      await store.setAdminUsername(normalized)
      return expressOk(res, null)
    }

    const current = getAuthUsername(req)
    if (!current) return expressFail(res, 401, 40101, '未登录')
    const admin = await store.getAdminUsername()
    if (!admin) return expressFail(res, 403, 40301, '未初始化管理员')
    if (current !== admin) return expressFail(res, 403, 40301, '无权限')

    if (password && password.trim()) {
      await store.upsertUser(normalized, hashPassword(String(password)))
    } else {
      const user = await store.getUser(normalized)
      if (!user) return expressFail(res, 404, 40401, '用户不存在')
      await store.upsertUser(user.username, user.password_hash)
    }

    return expressOk(res, null)
  } catch (error) {
    next(error)
  }
})

router.post('/users/update', requireAdmin(), async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {}
    if (!username || !password) return expressFail(res, 400, 40001, '参数错误')
    const store = req.app.locals.store
    await store.upsertUser(String(username).trim(), hashPassword(String(password)))
    return expressOk(res, null)
  } catch (error) {
    next(error)
  }
})

router.delete('/users', requireAdmin(), async (req, res, next) => {
  try {
    const { username } = req.query ?? {}
    if (!username) return expressFail(res, 400, 40001, '参数错误')
    const store = req.app.locals.store
    await store.deleteUser(String(username))
    return expressOk(res, null)
  } catch (error) {
    next(error)
  }
})

export const basePath = '/api'
export { router }
