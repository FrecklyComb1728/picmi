import { hashPassword } from '../../utils/hash.js'
import { fail, getAuthUsername, ok, readBodySafe, requireAuth, usePicmi } from '../../utils/nitro'

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event)
  if (auth) return auth

  try {
    const picmi = await usePicmi(event)

    const body = await readBodySafe<{ username?: string; password?: string }>(event)
    const username = body?.username
    const password = body?.password
    if (!username || !password) return fail(event, 400, 40001, '参数错误')

    const current = getAuthUsername(event)
    const normalized = String(username).trim()
    if (!current || normalized !== current) return fail(event, 403, 40301, '无权限')
    await picmi.store.upsertUser(normalized, hashPassword(String(password)))
    return ok(null)
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})
