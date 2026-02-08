import { hashPassword } from '../../utils/hash.js'
import { fail, getAuthUsername, ok, readBodySafe, requireAdmin, usePicmi } from '../../utils/nitro'

export default defineEventHandler(async (event) => {
  try {
    const picmi = await usePicmi(event)
    const existingUsers = await picmi.store.getUsers()

    const body = await readBodySafe<{ username?: string; password?: string }>(event)
    const username = body?.username
    const password = body?.password

    if (!username) return fail(event, 400, 40001, '参数错误')
    if (typeof password !== 'string' && password !== undefined) return fail(event, 400, 40001, '参数错误')

    const normalized = String(username).trim()

    if (existingUsers.length === 0) {
      if (!password || !password.trim()) return fail(event, 400, 40001, '参数错误')
      const xff = String(event.node.req.headers['x-forwarded-for'] ?? '').trim()
      const remoteAddress = String(event.node.req.socket.remoteAddress ?? '')
      const isLocal = remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1'
      if (xff && picmi.config.auth?.allowRemoteInit !== true) return fail(event, 403, 40301, '无权限')
      if (!isLocal && picmi.config.auth?.allowRemoteInit !== true) return fail(event, 403, 40301, '无权限')
      await picmi.store.upsertUser(normalized, hashPassword(String(password)))
      await picmi.store.setAdminUsername(normalized)
      return ok(null)
    }

    const admin = await requireAdmin(event)
    if (admin) return admin
    const current = getAuthUsername(event)
    if (!current) return fail(event, 401, 40101, '未登录')

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
