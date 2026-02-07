import { deleteCookie } from 'h3'
import { ok } from '../utils/nitro'

export default defineEventHandler(async (event) => {
  const xfp = String(event.node.req.headers['x-forwarded-proto'] ?? '')
  const secure = xfp === 'https' || Boolean((event.node.req.socket as any)?.encrypted)
  deleteCookie(event, 'picmi.auth', { path: '/', httpOnly: true, secure, sameSite: 'lax' })
  return ok(null)
})
