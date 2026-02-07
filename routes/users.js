import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { hashPassword } from '../server/utils/hash.js'
import { expressOk, expressFail } from '../server/utils/http.js'

const router = Router()

router.get('/users', requireAuth(), async (req, res, next) => {
  try {
    const store = req.app.locals.store
    const users = await store.getUsers()
    return expressOk(res, { users })
  } catch (error) {
    next(error)
  }
})

router.post('/users', requireAuth(), async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {}
    if (!username) return expressFail(res, 400, 40001, '参数错误')
    if (typeof password !== 'string' && password !== undefined) return expressFail(res, 400, 40001, '参数错误')

    const store = req.app.locals.store
    if (password && password.trim()) {
      await store.upsertUser(String(username).trim(), hashPassword(String(password)))
    } else {
      const current = await store.getUser(String(username).trim())
      if (!current) return expressFail(res, 404, 40401, '用户不存在')
      await store.upsertUser(current.username, current.password_hash)
    }

    return expressOk(res, null)
  } catch (error) {
    next(error)
  }
})

router.post('/users/update', requireAuth(), async (req, res, next) => {
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

router.delete('/users', requireAuth(), async (req, res, next) => {
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
