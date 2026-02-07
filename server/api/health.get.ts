import { ok } from '../utils/nitro'

export default defineEventHandler(() => {
  return ok({ status: 'ok' })
})
