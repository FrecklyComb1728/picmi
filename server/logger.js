import pino, { multistream } from 'pino'
import fsSync from 'fs'
import path from 'path'

const createLogger = (config) => {
  const level = (process.env.LOG_LEVEL || config.logLevel || 'INFO').toLowerCase()
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
