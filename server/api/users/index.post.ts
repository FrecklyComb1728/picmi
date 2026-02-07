import { hashPassword } from '../../utils/hash.js'
import { fail, ok, readBodySafe, requireAuth, usePicmi } from '../../utils/nitro'

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event)
  if (auth) return auth

  try {
    const picmi = await usePicmi(event)

    const body = await readBodySafe<{ username?: string; password?: string }>(event)
    const username = body?.username
    const password = body?.password

    if (!username) return fail(event, 400, 40001, '参数错误')
    if (typeof password !== 'string' && password !== undefined) return fail(event, 400, 40001, '参数错误')

    const normalized = String(username).trim()
    if (password && password.trim()) {
      await picmi.store.upsertUser(normalized, hashPassword(String(password)))
    } else {
      const current = await picmi.store.getUser(normalized)
      if (!current) return fail(event, 404, 40401, '用户不存在')
      await picmi.store.upsertUser(current.username, current.password_hash)
    }

    return ok(null)
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})
