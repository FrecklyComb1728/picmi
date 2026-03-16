import { getResponseStatus } from 'h3'
import { usePicmi } from '../utils/nitro'

const now = () => Date.now()

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', async (event) => {
    ;(event.context as any).__reqStartAt = now()
  })

  nitroApp.hooks.hook('afterResponse', async (event) => {
    try {
      const picmi = await usePicmi(event)
      const startAt = Number((event.context as any).__reqStartAt ?? now())
      const durationMs = Math.max(0, now() - startAt)
      const req = event.node.req
      const status = getResponseStatus(event)
      picmi.logger.info({
        type: 'http',
        method: req.method,
        path: req.url,
        status,
        durationMs
      })
    } catch {}
  })
})
