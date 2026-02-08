import { getQuery } from 'h3'
import { fail, ok, requireAdmin, usePicmi } from '../../utils/nitro'

export default defineEventHandler(async (event) => {
  const auth = await requireAdmin(event)
  if (auth) return auth

  try {
    const picmi = await usePicmi(event)

    const query = getQuery(event) as { username?: string }
    const username = query?.username
    if (!username) return fail(event, 400, 40001, '参数错误')

    const normalized = String(username).trim()
    const adminUsername = await picmi.store.getAdminUsername()
    if (adminUsername && normalized === adminUsername) return fail(event, 400, 40004, '不可删除管理员')
    const users = await picmi.store.getUsers()
    if (users.length <= 1) return fail(event, 400, 40005, '至少保留一个用户')
    await picmi.store.deleteUser(normalized)
    return ok(null)
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})
