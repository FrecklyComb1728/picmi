import pg from 'pg'

const { Pool } = pg

const initPostgresql = async (config) => {
  const pool = new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: config.ssl ? { rejectUnauthorized: false } : false
  })

  const normalize = (sql, params) => {
    let idx = 0
    const text = sql.replace(/\?/g, () => {
      idx += 1
      return `$${idx}`
    })
    return { text, values: params }
  }

  const run = async (sql, params = []) => {
    const query = normalize(sql, params)
    await pool.query(query)
  }

  const all = async (sql, params = []) => {
    const query = normalize(sql, params)
    const res = await pool.query(query)
    return res.rows ?? []
  }

  const init = async () => {
    await run('CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password_hash TEXT NOT NULL)')
    await run('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    await run('CREATE TABLE IF NOT EXISTS nodes (id TEXT PRIMARY KEY, name TEXT, type TEXT, address TEXT, username TEXT, password TEXT, enabled BOOLEAN, root_dir TEXT)')
    await run('CREATE TABLE IF NOT EXISTS public_paths (path TEXT PRIMARY KEY)')
    const columns = await all("SELECT column_name FROM information_schema.columns WHERE table_name = 'nodes' AND column_name = 'type'")
    if (columns.length === 0) {
      await run('ALTER TABLE nodes ADD COLUMN type TEXT')
    }
    const userColumns = await all("SELECT column_name FROM information_schema.columns WHERE table_name = 'nodes' AND column_name = 'username'")
    if (userColumns.length === 0) {
      await run('ALTER TABLE nodes ADD COLUMN username TEXT')
    }
  }

  await init()

  return {
    all,
    run,
    close: async () => {
      await pool.end()
    }
  }
}

export { initPostgresql }
