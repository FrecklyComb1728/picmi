import { deleteCookie } from 'h3'
import { ok, usePicmi } from '../utils/nitro'

export default defineEventHandler(async (event) => {
  const picmi = await usePicmi(event)
  const xfp = String(event.node.req.headers['x-forwarded-proto'] ?? '')
  const trustProxy = picmi.config?.trustProxy !== false
  const secure = trustProxy ? (xfp === 'https' || Boolean((event.node.req.socket as any)?.encrypted)) : Boolean((event.node.req.socket as any)?.encrypted)
  deleteCookie(event, 'picmi.auth', { path: '/', httpOnly: true, secure, sameSite: 'lax' })
  return ok(null)
})
