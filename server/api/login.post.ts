import { setCookie } from 'h3'
import { hashPassword, needsRehash, verifyPassword } from '../utils/hash.js'
import { createAuthCookieValue } from '../utils/auth-cookie.js'
import { fail, ok, readBodySafe, usePicmi } from '../utils/nitro'

export default defineEventHandler(async (event) => {
  try {
    const picmi = await usePicmi(event)

    const body = await readBodySafe<{ username?: string; password?: string }>(event)
    const username = body?.username
    const password = body?.password
    if (!username || !password) return fail(event, 400, 40001, '参数错误')

    const user = await picmi.store.getUser(String(username))
    if (!user) return fail(event, 401, 40101, '账号或密码错误')

    if (!verifyPassword(String(password), user.password_hash)) return fail(event, 401, 40101, '账号或密码错误')
    if (needsRehash(user.password_hash)) {
      await picmi.store.upsertUser(user.username, hashPassword(String(password)))
    }

    const token = createAuthCookieValue({ u: user.username, t: Date.now() })
    const xfp = String(event.node.req.headers['x-forwarded-proto'] ?? '')
    const trustProxy = picmi.config?.trustProxy !== false
    const secure = trustProxy ? (xfp === 'https' || Boolean((event.node.req.socket as any)?.encrypted)) : Boolean((event.node.req.socket as any)?.encrypted)
    const maxAge = Math.max(60, Number(picmi.config.auth?.maxAgeSeconds ?? 0) || 7 * 24 * 60 * 60)
    setCookie(event, 'picmi.auth', token, { sameSite: 'lax', path: '/', httpOnly: true, secure, maxAge })
    return ok({ username: user.username })
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})
