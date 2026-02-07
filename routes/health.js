import { Router } from 'express'
import { expressOk } from '../server/utils/http.js'

const router = Router()

router.get('/health', async (req, res, next) => {
  try {
    return expressOk(res, { status: 'ok' })
  } catch (error) {
    next(error)
  }
})

export const basePath = '/api'
export { router }
