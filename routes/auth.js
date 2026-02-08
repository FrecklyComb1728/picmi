import { Router } from 'express'
import { hashPassword, needsRehash, verifyPassword } from '../server/utils/hash.js'
import { createAuthCookieValue, parseAuthCookieValue } from '../server/utils/auth-cookie.js'
import { expressOk, expressFail } from '../server/utils/http.js'

const router = Router()

router.get('/auth/status', async (req, res, next) => {
  try {
    const store = req.app.locals.store
    const users = await store.getUsers()
    const token = req.cookies?.['picmi.auth']
    const loggedIn = Boolean(parseAuthCookieValue(token))
    return expressOk(res, { needsSetup: users.length === 0, loggedIn })
  } catch (error) {
    next(error)
  }
})

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {}
    if (!username || !password) return expressFail(res, 400, 40001, '参数错误')

    const store = req.app.locals.store
    const user = await store.getUser(String(username))
    if (!user) return expressFail(res, 401, 40101, '账号或密码错误')

    if (!verifyPassword(String(password), user.password_hash)) return expressFail(res, 401, 40101, '账号或密码错误')
    if (needsRehash(user.password_hash)) {
      await store.upsertUser(user.username, hashPassword(String(password)))
    }

    const token = createAuthCookieValue({ u: user.username, t: Date.now() })
    const xfp = String(req.headers['x-forwarded-proto'] ?? '')
    const trustProxy = req.app.locals.config?.trustProxy !== false
    const secure = trustProxy ? (req.secure || xfp === 'https') : req.secure
    const maxAgeSeconds = Math.max(60, Number(req.app.locals.config?.auth?.maxAgeSeconds ?? 0) || 7 * 24 * 60 * 60)
    res.cookie('picmi.auth', token, { sameSite: 'lax', path: '/', httpOnly: true, secure, maxAge: maxAgeSeconds * 1000 })
    return expressOk(res, { username: user.username })
  } catch (error) {
    next(error)
  }
})

router.post('/logout', async (req, res, next) => {
  try {
    const xfp = String(req.headers['x-forwarded-proto'] ?? '')
    const trustProxy = req.app.locals.config?.trustProxy !== false
    const secure = trustProxy ? (req.secure || xfp === 'https') : req.secure
    res.clearCookie('picmi.auth', { path: '/', httpOnly: true, secure, sameSite: 'lax' })
    return expressOk(res, null)
  } catch (error) {
    next(error)
  }
})

export const basePath = '/api'
export { router }
