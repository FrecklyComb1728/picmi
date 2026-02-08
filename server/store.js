import { initSqlite } from './db/sqlite.js'
import { initMysql } from './db/mysql.js'
import { initPostgresql } from './db/postgresql.js'
import { initSupabase } from './db/supabase.js'

const buildStore = async (config) => {
  const driver = config.database.driver

  if (driver === 'sqlite') {
    const db = await initSqlite(config.database.sqlite.file)
    return createSqlStore(db, 'sqlite')
  }

  if (driver === 'mysql') {
    const db = await initMysql(config.database.mysql)
    return createSqlStore(db, 'mysql')
  }

  if (driver === 'postgresql') {
    const db = await initPostgresql(config.database.postgresql)
    return createSqlStore(db, 'postgresql')
  }

  if (driver === 'supabase') {
    const sb = await initSupabase(config.database.supabase)
    return createSupabaseStore(sb)
  }

  throw new Error('unsupported database driver')
}

const createSqlStore = (db, dialect) => {
  const upsertSettingSql = () => {
    if (dialect === 'mysql') return 'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)'
    if (dialect === 'postgresql') return 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value'
    return 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
  }

  const upsertUserSql = () => {
    if (dialect === 'mysql') return 'INSERT INTO users (username, password_hash) VALUES (?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)'
    if (dialect === 'postgresql') return 'INSERT INTO users (username, password_hash) VALUES (?, ?) ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash'
    return 'INSERT OR REPLACE INTO users (username, password_hash) VALUES (?, ?)'
  }

  let usersHasCreatedAt = null
  const detectUsersCreatedAt = async () => {
    if (usersHasCreatedAt != null) return usersHasCreatedAt
    if (dialect !== 'sqlite') {
      usersHasCreatedAt = false
      return usersHasCreatedAt
    }
    try {
      const rows = await db.all('PRAGMA table_info(users)')
      usersHasCreatedAt = rows.some((row) => row.name === 'created_at')
      return usersHasCreatedAt
    } catch {
      usersHasCreatedAt = false
      return usersHasCreatedAt
    }
  }

  let nodesHasType = null
  const detectNodesType = async () => {
    if (nodesHasType != null) return nodesHasType
    try {
      if (dialect === 'sqlite') {
        const rows = await db.all('PRAGMA table_info(nodes)')
        nodesHasType = rows.some((row) => row.name === 'type')
        return nodesHasType
      }
      if (dialect === 'mysql') {
        const rows = await db.all("SHOW COLUMNS FROM nodes LIKE 'type'")
        nodesHasType = rows.length > 0
        return nodesHasType
      }
      if (dialect === 'postgresql') {
        const rows = await db.all("SELECT column_name FROM information_schema.columns WHERE table_name = 'nodes' AND column_name = 'type'")
        nodesHasType = rows.length > 0
        return nodesHasType
      }
      nodesHasType = false
      return nodesHasType
    } catch {
      nodesHasType = false
      return nodesHasType
    }
  }

  let nodesHasUsername = null
  const detectNodesUsername = async () => {
    if (nodesHasUsername != null) return nodesHasUsername
    try {
      if (dialect === 'sqlite') {
        const rows = await db.all('PRAGMA table_info(nodes)')
        nodesHasUsername = rows.some((row) => row.name === 'username')
        return nodesHasUsername
      }
      if (dialect === 'mysql') {
        const rows = await db.all("SHOW COLUMNS FROM nodes LIKE 'username'")
        nodesHasUsername = rows.length > 0
        return nodesHasUsername
      }
      if (dialect === 'postgresql') {
        const rows = await db.all("SELECT column_name FROM information_schema.columns WHERE table_name = 'nodes' AND column_name = 'username'")
        nodesHasUsername = rows.length > 0
        return nodesHasUsername
      }
      nodesHasUsername = false
      return nodesHasUsername
    } catch {
      nodesHasUsername = false
      return nodesHasUsername
    }
  }

  const upsertPublicSql = () => {
    if (dialect === 'mysql') return 'INSERT INTO public_paths (path) VALUES (?) ON DUPLICATE KEY UPDATE path = VALUES(path)'
    if (dialect === 'postgresql') return 'INSERT INTO public_paths (path) VALUES (?) ON CONFLICT (path) DO NOTHING'
    return 'INSERT OR REPLACE INTO public_paths (path) VALUES (?)'
  }
  const getSetting = async (key) => {
    const sql = dialect === 'mysql'
      ? 'SELECT `value` FROM settings WHERE `key` = ?'
      : 'SELECT value FROM settings WHERE key = ?'
    const rows = await db.all(sql, [key])
    return rows[0]?.value ?? null
  }

  const setSetting = async (key, value) => {
    await db.run(upsertSettingSql(), [key, value])
  }

  const getAdminUsername = async () => {
    const value = await getSetting('adminUsername')
    const normalized = String(value ?? '').trim()
    return normalized ? normalized : null
  }

  const setAdminUsername = async (username) => {
    const normalized = String(username ?? '').trim()
    await setSetting('adminUsername', normalized)
  }

  const getUsers = async () => {
    const rows = await db.all('SELECT username FROM users')
    return rows.map((row) => ({ username: row.username }))
  }

  const getUser = async (username) => {
    const rows = await db.all('SELECT username, password_hash FROM users WHERE username = ?', [username])
    return rows[0] ?? null
  }

  const upsertUser = async (username, passwordHash) => {
    if (await detectUsersCreatedAt()) {
      await db.run(
        'INSERT OR REPLACE INTO users (username, password_hash, created_at) VALUES (?, ?, COALESCE((SELECT created_at FROM users WHERE username = ?), CURRENT_TIMESTAMP))',
        [username, passwordHash, username]
      )
      return
    }
    await db.run(upsertUserSql(), [username, passwordHash])
  }

  const deleteUser = async (username) => {
    await db.run('DELETE FROM users WHERE username = ?', [username])
  }

  const getNodes = async () => {
    const hasType = await detectNodesType()
    const hasUsername = await detectNodesUsername()
    const selectParts = ['id', 'name', 'address', 'password', 'enabled', 'root_dir AS rootDir']
    if (hasType) selectParts.push('type')
    if (hasUsername) selectParts.push('username')
    const rows = await db.all(`SELECT ${selectParts.join(', ')} FROM nodes`)
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type ?? 'picmi-node',
      address: row.address,
      username: row.username ?? '',
      password: row.password,
      enabled: Boolean(row.enabled),
      rootDir: row.rootDir
    }))
  }

  const saveNodes = async (nodes) => {
    const hasType = await detectNodesType()
    const hasUsername = await detectNodesUsername()
    await db.run('DELETE FROM nodes')
    for (const node of nodes) {
      const enabledValue = dialect === 'postgresql' ? Boolean(node.enabled) : (node.enabled ? 1 : 0)
      const columns = ['id', 'name', 'address', 'password', 'enabled', 'root_dir']
      const values = [node.id, node.name, node.address, node.password ?? '', enabledValue, node.rootDir]
      if (hasType) {
        columns.push('type')
        values.push(node.type ?? 'picmi-node')
      }
      if (hasUsername) {
        columns.push('username')
        values.push(node.username ?? '')
      }
      const placeholders = columns.map(() => '?').join(', ')
      await db.run(
        `INSERT INTO nodes (${columns.join(', ')}) VALUES (${placeholders})`,
        values
      )
    }
  }

  const getPublicPaths = async () => {
    const rows = await db.all('SELECT path FROM public_paths')
    return rows.map((row) => row.path)
  }

  const setPublicPath = async (path, enabled) => {
    if (enabled) await db.run(upsertPublicSql(), [path])
    else await db.run('DELETE FROM public_paths WHERE path = ?', [path])
  }

  const getConfig = async () => {
    const listApi = (await getSetting('listApi')) ?? '/api/images/list'
    const enableLocalStorage = (await getSetting('enableLocalStorage')) === '1'
    const maxUploadBytesRaw = await getSetting('maxUploadBytes')
    const maxUploadBytesDefault = 20 * 1024 * 1024
    const parsed = Number(maxUploadBytesRaw)
    const maxUploadBytes = Number.isFinite(parsed)
      ? Math.max(1 * 1024 * 1024, Math.floor(parsed))
      : maxUploadBytesDefault
    const nodes = await getNodes()
    return { listApi, nodes, enableLocalStorage, maxUploadBytes }
  }

  const saveConfig = async (listApi, nodes, enableLocalStorage, maxUploadBytes) => {
    await setSetting('listApi', listApi)
    await setSetting('enableLocalStorage', enableLocalStorage ? '1' : '0')
    const maxUploadBytesDefault = 20 * 1024 * 1024
    const parsed = Number(maxUploadBytes)
    const normalized = Number.isFinite(parsed)
      ? Math.max(1 * 1024 * 1024, Math.floor(parsed))
      : maxUploadBytesDefault
    await setSetting('maxUploadBytes', String(normalized))
    await saveNodes(nodes)
  }

  return {
    getAdminUsername,
    setAdminUsername,
    getUsers,
    getUser,
    upsertUser,
    deleteUser,
    getConfig,
    saveConfig,
    getPublicPaths,
    setPublicPath,
    close: async () => db.close()
  }
}

const createSupabaseStore = (sb) => {
  const getAdminUsername = async () => {
    const rows = await sb.all('settings', 'key, value')
    const value = rows.find((row) => row.key === 'adminUsername')?.value
    const normalized = String(value ?? '').trim()
    return normalized ? normalized : null
  }

  const setAdminUsername = async (username) => {
    const normalized = String(username ?? '').trim()
    await sb.upsert('settings', { key: 'adminUsername', value: normalized })
  }

  const getUsers = async () => {
    const rows = await sb.all('users', 'username')
    return rows.map((row) => ({ username: row.username }))
  }

  const getUser = async (username) => {
    const rows = await sb.all('users', 'username, password_hash')
    return rows.find((row) => row.username === username) ?? null
  }

  const upsertUser = async (username, passwordHash) => {
    await sb.upsert('users', { username, password_hash: passwordHash })
  }

  const deleteUser = async (username) => {
    await sb.del('users', { username })
  }

  const getNodes = async () => {
    try {
      const rows = await sb.all('nodes', 'id, name, address, username, password, enabled, root_dir, type')
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type ?? 'picmi-node',
        address: row.address,
        username: row.username ?? '',
        password: row.password,
        enabled: Boolean(row.enabled),
        rootDir: row.root_dir
      }))
    } catch {
      const rows = await sb.all('nodes', 'id, name, address, password, enabled, root_dir')
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        type: 'picmi-node',
        address: row.address,
        username: '',
        password: row.password,
        enabled: Boolean(row.enabled),
        rootDir: row.root_dir
      }))
    }
  }

  const saveNodes = async (nodes) => {
    const rowsWithType = nodes.map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type ?? 'picmi-node',
      address: node.address,
      username: node.username ?? '',
      password: node.password ?? '',
      enabled: node.enabled,
      root_dir: node.rootDir
    }))
    try {
      await sb.replace('nodes', rowsWithType, 'id')
    } catch {
      const rows = nodes.map((node) => ({
        id: node.id,
        name: node.name,
        address: node.address,
        password: node.password ?? '',
        enabled: node.enabled,
        root_dir: node.rootDir
      }))
      await sb.replace('nodes', rows, 'id')
    }
  }

  const getConfig = async () => {
    const rows = await sb.all('settings', 'key, value')
    const map = new Map(rows.map((row) => [row.key, row.value]))
    const listApi = map.get('listApi') ?? '/api/images/list'
    const enableLocalStorage = map.get('enableLocalStorage') === '1'
    const maxUploadBytesRaw = map.get('maxUploadBytes')
    const maxUploadBytesDefault = 20 * 1024 * 1024
    const maxUploadBytesMax = 200 * 1024 * 1024
    const parsed = Number(maxUploadBytesRaw)
    const maxUploadBytes = Number.isFinite(parsed)
      ? Math.max(1 * 1024 * 1024, Math.min(maxUploadBytesMax, Math.floor(parsed)))
      : maxUploadBytesDefault
    const nodes = await getNodes()
    return { listApi, nodes, enableLocalStorage, maxUploadBytes }
  }

  const saveConfig = async (listApi, nodes, enableLocalStorage, maxUploadBytes) => {
    await sb.upsert('settings', { key: 'listApi', value: listApi })
    await sb.upsert('settings', { key: 'enableLocalStorage', value: enableLocalStorage ? '1' : '0' })
    const maxUploadBytesDefault = 20 * 1024 * 1024
    const maxUploadBytesMax = 200 * 1024 * 1024
    const parsed = Number(maxUploadBytes)
    const normalized = Number.isFinite(parsed)
      ? Math.max(1 * 1024 * 1024, Math.min(maxUploadBytesMax, Math.floor(parsed)))
      : maxUploadBytesDefault
    await sb.upsert('settings', { key: 'maxUploadBytes', value: String(normalized) })
    await saveNodes(nodes)
  }

  const getPublicPaths = async () => {
    const rows = await sb.all('public_paths', 'path')
    return rows.map((row) => row.path)
  }

  const setPublicPath = async (path, enabled) => {
    if (enabled) await sb.upsert('public_paths', { path })
    else await sb.del('public_paths', { path })
  }

  return {
    getAdminUsername,
    setAdminUsername,
    getUsers,
    getUser,
    upsertUser,
    deleteUser,
    getConfig,
    saveConfig,
    getPublicPaths,
    setPublicPath,
    close: async () => sb.close()
  }
}

export { buildStore }
