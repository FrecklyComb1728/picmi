import mysql from 'mysql2/promise'

const initMysql = async (config) => {
  const pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: 5
  })

  const run = async (sql, params = []) => {
    await pool.execute(sql, params)
  }

  const all = async (sql, params = []) => {
    const [rows] = await pool.execute(sql, params)
    return Array.isArray(rows) ? rows : []
  }

  const init = async () => {
    await run('CREATE TABLE IF NOT EXISTS users (username VARCHAR(128) PRIMARY KEY, password_hash VARCHAR(256) NOT NULL)')
    await run('CREATE TABLE IF NOT EXISTS settings (`key` VARCHAR(128) PRIMARY KEY, `value` TEXT NOT NULL)')
    await run('CREATE TABLE IF NOT EXISTS nodes (id VARCHAR(128) PRIMARY KEY, name VARCHAR(128), type VARCHAR(32), address TEXT, username TEXT, password TEXT, enabled TINYINT, root_dir TEXT)')
    await run('CREATE TABLE IF NOT EXISTS public_paths (path TEXT PRIMARY KEY)')
    const columns = await all("SHOW COLUMNS FROM nodes LIKE 'type'")
    if (columns.length === 0) {
      await run('ALTER TABLE nodes ADD COLUMN type VARCHAR(32)')
    }
    const userColumns = await all("SHOW COLUMNS FROM nodes LIKE 'username'")
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

export { initMysql }
