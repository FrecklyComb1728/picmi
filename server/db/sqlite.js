import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import initSqlJs from 'sql.js'
import { fileURLToPath } from 'url'

const initSqlite = async (file) => {
  const modulePath = path.dirname(fileURLToPath(import.meta.url))
  const locateFile = (name) => path.resolve(modulePath, '../../node_modules/sql.js/dist', name)
  const SQL = await initSqlJs({ locateFile })

  const resolved = path.resolve(file)
  let db

  if (fsSync.existsSync(resolved)) {
    const buf = await fs.readFile(resolved)
    db = new SQL.Database(new Uint8Array(buf))
  } else {
    db = new SQL.Database()
  }

  const exec = (sql, params = []) => {
    const stmt = db.prepare(sql)
    stmt.bind(params)
    while (stmt.step()) {
      stmt.get()
    }
    stmt.free()
  }

  const all = (sql, params = []) => {
    const stmt = db.prepare(sql)
    stmt.bind(params)
    const rows = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  }

  const persist = async () => {
    const data = db.export()
    await fs.mkdir(path.dirname(resolved), { recursive: true })
    await fs.writeFile(resolved, Buffer.from(data))
  }

  const run = async (sql, params = []) => {
    exec(sql, params)
    await persist()
  }

  const init = async () => {
    await run('CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password_hash TEXT NOT NULL)')
    await run('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    await run('CREATE TABLE IF NOT EXISTS nodes (id TEXT PRIMARY KEY, name TEXT, type TEXT, address TEXT, username TEXT, password TEXT, enabled INTEGER, root_dir TEXT)')
    await run('CREATE TABLE IF NOT EXISTS public_paths (path TEXT PRIMARY KEY)')
    const columns = await all('PRAGMA table_info(nodes)')
    if (!columns.some((row) => row.name === 'type')) {
      await run('ALTER TABLE nodes ADD COLUMN type TEXT')
    }
    if (!columns.some((row) => row.name === 'username')) {
      await run('ALTER TABLE nodes ADD COLUMN username TEXT')
    }
  }

  await init()

  return {
    all: async (sql, params = []) => all(sql, params),
    run,
    close: async () => {
      await persist()
      db.close()
    }
  }
}

export { initSqlite }
