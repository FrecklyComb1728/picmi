import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { expressOk } from '../server/utils/http.js'

const router = Router()

router.get('/nodes/status', requireAuth(), async (req, res, next) => {
  try {
    const monitor = req.app.locals.nodeMonitor
    const byId = monitor?.snapshot?.() ?? {}
    return expressOk(res, { byId })
  } catch (error) {
    next(error)
  }
})

export const basePath = '/api'
export { router }

