import pino, { multistream } from 'pino'
import fsSync from 'fs'
import path from 'path'

const isTruthy = (value) => {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return false
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

const isDebugMode = () => {
  if (process.argv.some((arg) => String(arg).trim() === '--debug')) return true
  if (isTruthy(process.env.PICMI_DEBUG)) return true
  if (isTruthy(process.env.npm_config_debug)) return true
  return false
}

const createLogger = (config) => {
  const debug = isDebugMode()
  const levelRaw = process.env.LOG_LEVEL || config.logLevel || 'INFO'
  const level = (debug ? 'debug' : String(levelRaw)).toLowerCase()
  const streams = [{ stream: process.stdout }]

  if (config.logFile) {
    const filePath = path.resolve(config.logFile)
    if (fsSync.existsSync(path.dirname(filePath))) {
      streams.push({ stream: pino.destination({ dest: filePath, sync: false }) })
    }
  }

  return pino({ level, base: null }, multistream(streams))
}

export { createLogger }
