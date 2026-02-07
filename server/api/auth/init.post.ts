import { hashPassword } from '../../utils/hash.js'
import { fail, ok, readBodySafe, usePicmi } from '../../utils/nitro'

export default defineEventHandler(async (event) => {
  try {
    const picmi = await usePicmi(event)

    const body = await readBodySafe<{ username?: string; password?: string }>(event)
    const username = body?.username
    const password = body?.password
    if (!username || !password) return fail(event, 400, 40001, '参数错误')

    const users = await picmi.store.getUsers()
    if (users.length > 0) return fail(event, 409, 40901, '已初始化')
    const allowRemote = picmi.config.auth?.allowRemoteInit === true
    const ip = String(event.node.req.socket.remoteAddress ?? '')
    if (!allowRemote && !isLocalAddress(ip)) return fail(event, 403, 40301, '禁止远程初始化')

    const normalized = String(username).trim()
    await picmi.store.upsertUser(normalized, hashPassword(String(password)))
    return ok({ username: normalized })
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})

const isLocalAddress = (ip: string) => {
  const value = String(ip ?? '').trim()
  if (!value) return false
  if (value === '::1' || value === '127.0.0.1') return true
  if (value.startsWith('::ffff:')) return isLocalAddress(value.slice('::ffff:'.length))
  if (value.startsWith('127.')) return true
  return false
}
