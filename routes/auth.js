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

router.post('/auth/init', async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {}
    if (!username || !password) return expressFail(res, 400, 40001, '参数错误')
    const store = req.app.locals.store
    const users = await store.getUsers()
    if (users.length > 0) return expressFail(res, 409, 40901, '已初始化')
    const allowRemote = req.app.locals.config?.auth?.allowRemoteInit === true
    const ip = String(req.ip || req.socket?.remoteAddress || '')
    if (!allowRemote && !isLocalAddress(ip)) return expressFail(res, 403, 40301, '禁止远程初始化')
    await store.upsertUser(String(username).trim(), hashPassword(String(password)))
    return expressOk(res, { username: String(username).trim() })
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
    const secure = req.secure || xfp === 'https'
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
    const secure = req.secure || xfp === 'https'
    res.clearCookie('picmi.auth', { path: '/', httpOnly: true, secure, sameSite: 'lax' })
    return expressOk(res, null)
  } catch (error) {
    next(error)
  }
})

export const basePath = '/api'
export { router }

const isLocalAddress = (ip) => {
  const value = String(ip ?? '').trim()
  if (!value) return false
  if (value === '::1' || value === '127.0.0.1') return true
  if (value.startsWith('::ffff:')) return isLocalAddress(value.slice('::ffff:'.length))
  if (value.startsWith('127.')) return true
  return false
}
