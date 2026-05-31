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
    const mediaRequireAuth = (await getSetting('mediaRequireAuth')) !== '0'
    const maxUploadBytesRaw = await getSetting('maxUploadBytes')
    const maxUploadBytesDefault = 20 * 1024 * 1024
    const parsed = Number(maxUploadBytesRaw)
    const maxUploadBytes = Number.isFinite(parsed)
      ? Math.max(1 * 1024 * 1024, Math.floor(parsed))
      : maxUploadBytesDefault
    const thumbnailProcessingRaw = String((await getSetting('thumbnailProcessing')) ?? '').trim()
    const thumbnailProcessing = thumbnailProcessingRaw === 'backend' ? 'backend' : 'node'
    const thumbnailMaxBytesRaw = await getSetting('thumbnailMaxBytes')
    const thumbBytesParsed = Number(thumbnailMaxBytesRaw)
    const thumbnailMaxBytesDefault = 1 * 1024 * 1024
    const thumbnailMaxBytes = Number.isFinite(thumbBytesParsed)
      ? Math.max(64 * 1024, Math.min(10 * 1024 * 1024, Math.floor(thumbBytesParsed)))
      : thumbnailMaxBytesDefault
    const thumbnailMaxWidthRaw = await getSetting('thumbnailMaxWidth')
    const thumbWidthParsed = Number(thumbnailMaxWidthRaw)
    const thumbnailMaxWidthDefault = 1600
    const thumbnailMaxWidth = Number.isFinite(thumbWidthParsed)
      ? Math.max(1024, Math.min(2048, Math.floor(thumbWidthParsed)))
      : thumbnailMaxWidthDefault
    const thumbnailSkipBelowBytesRaw = await getSetting('thumbnailSkipBelowBytes')
    const skipBelowParsed = Number(thumbnailSkipBelowBytesRaw)
    const thumbnailSkipBelowBytes = Number.isFinite(skipBelowParsed)
      ? Math.max(0, Math.min(50 * 1024 * 1024, Math.floor(skipBelowParsed)))
      : 0
    const nodes = await getNodes()
    return { listApi, nodes, enableLocalStorage, mediaRequireAuth, maxUploadBytes, thumbnailProcessing, thumbnailMaxBytes, thumbnailMaxWidth, thumbnailSkipBelowBytes }
  }

  const saveConfig = async (listApi, nodes, enableLocalStorage, mediaRequireAuth, maxUploadBytes, thumbnailProcessing, thumbnailMaxBytes, thumbnailMaxWidth, thumbnailSkipBelowBytes) => {
    await setSetting('listApi', listApi)
    await setSetting('enableLocalStorage', enableLocalStorage ? '1' : '0')
    await setSetting('mediaRequireAuth', mediaRequireAuth === false ? '0' : '1')
    const maxUploadBytesDefault = 20 * 1024 * 1024
    const parsed = Number(maxUploadBytes)
    const normalized = Number.isFinite(parsed)
      ? Math.max(1 * 1024 * 1024, Math.floor(parsed))
      : maxUploadBytesDefault
    await setSetting('maxUploadBytes', String(normalized))
    const thumbMode = String(thumbnailProcessing ?? '').trim() === 'backend' ? 'backend' : 'node'
    await setSetting('thumbnailProcessing', thumbMode)
    const thumbBytesParsed = Number(thumbnailMaxBytes)
    const thumbBytesNorm = Number.isFinite(thumbBytesParsed)
      ? Math.max(64 * 1024, Math.min(10 * 1024 * 1024, Math.floor(thumbBytesParsed)))
      : 1 * 1024 * 1024
    await setSetting('thumbnailMaxBytes', String(thumbBytesNorm))
    const thumbWidthParsed = Number(thumbnailMaxWidth)
    const thumbWidthNorm = Number.isFinite(thumbWidthParsed)
      ? Math.max(1024, Math.min(2048, Math.floor(thumbWidthParsed)))
      : 1600
    await setSetting('thumbnailMaxWidth', String(thumbWidthNorm))
    const skipBelowParsed = Number(thumbnailSkipBelowBytes)
    const skipBelowNorm = Number.isFinite(skipBelowParsed)
      ? Math.max(0, Math.min(50 * 1024 * 1024, Math.floor(skipBelowParsed)))
      : 0
    await setSetting('thumbnailSkipBelowBytes', String(skipBelowNorm))
    await saveNodes(nodes)
  }

  const getImageUrlCache = async (nodeId, folderPath) => {
    const rows = await db.all(
      'SELECT id, node_id, folder_path, url, file_name, file_size, uploaded_at, updated_at FROM image_url_caches WHERE node_id = ? AND folder_path = ?',
      [nodeId, folderPath]
    )
    return rows.map((row) => ({
      id: row.id,
      nodeId: row.node_id,
      folderPath: row.folder_path,
      url: row.url,
      fileName: row.file_name,
      fileSize: row.file_size,
      uploadedAt: row.uploaded_at,
      updatedAt: row.updated_at
    }))
  }

  const setImageUrlCache = async (nodeId, folderPath, urls) => {
    await db.run('DELETE FROM image_url_caches WHERE node_id = ? AND folder_path = ?', [nodeId, folderPath])
    const now = new Date().toISOString()
    for (const entry of urls) {
      await db.run(
        'INSERT INTO image_url_caches (node_id, folder_path, url, file_name, file_size, uploaded_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [nodeId, folderPath, entry.url, entry.fileName ?? null, entry.fileSize ?? null, entry.uploadedAt ?? null, now]
      )
    }
  }

  const addImageUrlCache = async (nodeId, folderPath, urlEntry) => {
    const now = new Date().toISOString()
    const upsertSql = () => {
      if (dialect === 'mysql') return 'INSERT INTO image_url_caches (node_id, folder_path, url, file_name, file_size, uploaded_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE file_name = VALUES(file_name), file_size = VALUES(file_size), uploaded_at = VALUES(uploaded_at), updated_at = VALUES(updated_at)'
      if (dialect === 'postgresql') return 'INSERT INTO image_url_caches (node_id, folder_path, url, file_name, file_size, uploaded_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (node_id, folder_path, url) DO UPDATE SET file_name = EXCLUDED.file_name, file_size = EXCLUDED.file_size, uploaded_at = EXCLUDED.uploaded_at, updated_at = EXCLUDED.updated_at'
      return 'INSERT OR REPLACE INTO image_url_caches (node_id, folder_path, url, file_name, file_size, uploaded_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    }
    await db.run(upsertSql(), [nodeId, folderPath, urlEntry.url, urlEntry.fileName ?? null, urlEntry.fileSize ?? null, urlEntry.uploadedAt ?? null, now])
  }

  const deleteImageUrlCache = async (nodeId, folderPath, url) => {
    await db.run('DELETE FROM image_url_caches WHERE node_id = ? AND folder_path = ? AND url = ?', [nodeId, folderPath, url])
  }

  const deleteImageUrlCacheByFolder = async (nodeId, folderPath) => {
    await db.run('DELETE FROM image_url_caches WHERE node_id = ? AND folder_path = ?', [nodeId, folderPath])
  }

  const writeCacheLog = async (operator, action, nodeId, folderPath, detail) => {
    const now = new Date().toISOString()
    await db.run(
      'INSERT INTO url_cache_logs (operator, action, node_id, folder_path, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [operator, action, nodeId ?? null, folderPath ?? null, detail ?? null, now]
    )
  }

  const getCacheLogs = async (limit = 50, offset = 0) => {
    const rows = await db.all(
      'SELECT id, operator, action, node_id, folder_path, detail, created_at FROM url_cache_logs ORDER BY id DESC LIMIT ? OFFSET ?',
      [limit, offset]
    )
    return rows.map((row) => ({
      id: row.id,
      operator: row.operator,
      action: row.action,
      nodeId: row.node_id,
      folderPath: row.folder_path,
      detail: row.detail,
      createdAt: row.created_at
    }))
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
    getImageUrlCache,
    setImageUrlCache,
    addImageUrlCache,
    deleteImageUrlCache,
    deleteImageUrlCacheByFolder,
    writeCacheLog,
    getCacheLogs,
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
    const mediaRequireAuth = map.get('mediaRequireAuth') !== '0'
    const maxUploadBytesRaw = map.get('maxUploadBytes')
    const maxUploadBytesDefault = 20 * 1024 * 1024
    const maxUploadBytesMax = 200 * 1024 * 1024
    const parsed = Number(maxUploadBytesRaw)
    const maxUploadBytes = Number.isFinite(parsed)
      ? Math.max(1 * 1024 * 1024, Math.min(maxUploadBytesMax, Math.floor(parsed)))
      : maxUploadBytesDefault
    const thumbnailProcessingRaw = String(map.get('thumbnailProcessing') ?? '').trim()
    const thumbnailProcessing = thumbnailProcessingRaw === 'backend' ? 'backend' : 'node'
    const thumbnailMaxBytesRaw = map.get('thumbnailMaxBytes')
    const thumbBytesParsed = Number(thumbnailMaxBytesRaw)
    const thumbnailMaxBytesDefault = 1 * 1024 * 1024
    const thumbnailMaxBytes = Number.isFinite(thumbBytesParsed)
      ? Math.max(64 * 1024, Math.min(10 * 1024 * 1024, Math.floor(thumbBytesParsed)))
      : thumbnailMaxBytesDefault
    const thumbnailMaxWidthRaw = map.get('thumbnailMaxWidth')
    const thumbWidthParsed = Number(thumbnailMaxWidthRaw)
    const thumbnailMaxWidthDefault = 1600
    const thumbnailMaxWidth = Number.isFinite(thumbWidthParsed)
      ? Math.max(1024, Math.min(2048, Math.floor(thumbWidthParsed)))
      : thumbnailMaxWidthDefault
    const thumbnailSkipBelowBytesRaw = map.get('thumbnailSkipBelowBytes')
    const skipBelowParsed = Number(thumbnailSkipBelowBytesRaw)
    const thumbnailSkipBelowBytes = Number.isFinite(skipBelowParsed)
      ? Math.max(0, Math.min(50 * 1024 * 1024, Math.floor(skipBelowParsed)))
      : 0
    const nodeReadStrategyRaw = String(map.get('nodeReadStrategy') ?? '').trim()
    const nodeReadStrategy = nodeReadStrategyRaw === 'random' || nodeReadStrategyRaw === 'path-hash' || nodeReadStrategyRaw === 'round-robin'
      ? nodeReadStrategyRaw
      : 'round-robin'
    const nodes = await getNodes()
    return { listApi, nodes, enableLocalStorage, mediaRequireAuth, maxUploadBytes, thumbnailProcessing, thumbnailMaxBytes, thumbnailMaxWidth, thumbnailSkipBelowBytes, nodeReadStrategy }
  }

  const saveConfig = async (listApi, nodes, enableLocalStorage, mediaRequireAuth, maxUploadBytes, thumbnailProcessing, thumbnailMaxBytes, thumbnailMaxWidth, thumbnailSkipBelowBytes, nodeReadStrategy) => {
    await sb.upsert('settings', { key: 'listApi', value: listApi })
    await sb.upsert('settings', { key: 'enableLocalStorage', value: enableLocalStorage ? '1' : '0' })
    await sb.upsert('settings', { key: 'mediaRequireAuth', value: mediaRequireAuth === false ? '0' : '1' })
    const maxUploadBytesDefault = 20 * 1024 * 1024
    const maxUploadBytesMax = 200 * 1024 * 1024
    const parsed = Number(maxUploadBytes)
    const normalized = Number.isFinite(parsed)
      ? Math.max(1 * 1024 * 1024, Math.min(maxUploadBytesMax, Math.floor(parsed)))
      : maxUploadBytesDefault
    await sb.upsert('settings', { key: 'maxUploadBytes', value: String(normalized) })
    const thumbMode = String(thumbnailProcessing ?? '').trim() === 'backend' ? 'backend' : 'node'
    await sb.upsert('settings', { key: 'thumbnailProcessing', value: thumbMode })
    const thumbBytesParsed = Number(thumbnailMaxBytes)
    const thumbBytesNorm = Number.isFinite(thumbBytesParsed)
      ? Math.max(64 * 1024, Math.min(10 * 1024 * 1024, Math.floor(thumbBytesParsed)))
      : 1 * 1024 * 1024
    await sb.upsert('settings', { key: 'thumbnailMaxBytes', value: String(thumbBytesNorm) })
    const thumbWidthParsed = Number(thumbnailMaxWidth)
    const thumbWidthNorm = Number.isFinite(thumbWidthParsed)
      ? Math.max(1024, Math.min(2048, Math.floor(thumbWidthParsed)))
      : 1600
    await sb.upsert('settings', { key: 'thumbnailMaxWidth', value: String(thumbWidthNorm) })
    const skipBelowParsed = Number(thumbnailSkipBelowBytes)
    const skipBelowNorm = Number.isFinite(skipBelowParsed)
      ? Math.max(0, Math.min(50 * 1024 * 1024, Math.floor(skipBelowParsed)))
      : 0
    await sb.upsert('settings', { key: 'thumbnailSkipBelowBytes', value: String(skipBelowNorm) })
    const readStrategyRaw = String(nodeReadStrategy ?? '').trim()
    const readStrategy = readStrategyRaw === 'random' || readStrategyRaw === 'path-hash' || readStrategyRaw === 'round-robin'
      ? readStrategyRaw
      : 'round-robin'
    await sb.upsert('settings', { key: 'nodeReadStrategy', value: readStrategy })
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

  const getImageUrlCache = async (nodeId, folderPath) => {
    const rows = await sb.all('image_url_caches', '*')
    return rows
      .filter((row) => row.node_id === nodeId && row.folder_path === folderPath)
      .map((row) => ({
        id: row.id,
        nodeId: row.node_id,
        folderPath: row.folder_path,
        url: row.url,
        fileName: row.file_name,
        fileSize: row.file_size,
        uploadedAt: row.uploaded_at,
        updatedAt: row.updated_at
      }))
  }

  const setImageUrlCache = async (nodeId, folderPath, urls) => {
    const existing = await sb.all('image_url_caches', '*')
    const toDelete = existing
      .filter((row) => row.node_id === nodeId && row.folder_path === folderPath)
      .map((row) => row.id)
    for (const id of toDelete) {
      await sb.del('image_url_caches', { id })
    }
    const now = new Date().toISOString()
    for (const entry of urls) {
      await sb.upsert('image_url_caches', {
        node_id: nodeId,
        folder_path: folderPath,
        url: entry.url,
        file_name: entry.fileName ?? null,
        file_size: entry.fileSize ?? null,
        uploaded_at: entry.uploadedAt ?? null,
        updated_at: now
      })
    }
  }

  const addImageUrlCache = async (nodeId, folderPath, urlEntry) => {
    const now = new Date().toISOString()
    const existing = await sb.all('image_url_caches', '*')
    const found = existing.find(
      (row) => row.node_id === nodeId && row.folder_path === folderPath && row.url === urlEntry.url
    )
    if (found) {
      await sb.del('image_url_caches', { id: found.id })
    }
    await sb.upsert('image_url_caches', {
      node_id: nodeId,
      folder_path: folderPath,
      url: urlEntry.url,
      file_name: urlEntry.fileName ?? null,
      file_size: urlEntry.fileSize ?? null,
      uploaded_at: urlEntry.uploadedAt ?? null,
      updated_at: now
    })
  }

  const deleteImageUrlCache = async (nodeId, folderPath, url) => {
    const existing = await sb.all('image_url_caches', '*')
    const toDelete = existing.filter(
      (row) => row.node_id === nodeId && row.folder_path === folderPath && row.url === url
    )
    for (const row of toDelete) {
      await sb.del('image_url_caches', { id: row.id })
    }
  }

  const deleteImageUrlCacheByFolder = async (nodeId, folderPath) => {
    const existing = await sb.all('image_url_caches', '*')
    const toDelete = existing.filter(
      (row) => row.node_id === nodeId && row.folder_path === folderPath
    )
    for (const row of toDelete) {
      await sb.del('image_url_caches', { id: row.id })
    }
  }

  const writeCacheLog = async (operator, action, nodeId, folderPath, detail) => {
    const now = new Date().toISOString()
    await sb.upsert('url_cache_logs', {
      operator,
      action,
      node_id: nodeId ?? null,
      folder_path: folderPath ?? null,
      detail: detail ?? null,
      created_at: now
    })
  }

  const getCacheLogs = async (limit = 50, offset = 0) => {
    const rows = await sb.all('url_cache_logs', '*')
    return rows
      .sort((a, b) => Number(b.id) - Number(a.id))
      .slice(offset, offset + limit)
      .map((row) => ({
        id: row.id,
        operator: row.operator,
        action: row.action,
        nodeId: row.node_id,
        folderPath: row.folder_path,
        detail: row.detail,
        createdAt: row.created_at
      }))
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
    getImageUrlCache,
    setImageUrlCache,
    addImageUrlCache,
    deleteImageUrlCache,
    deleteImageUrlCacheByFolder,
    writeCacheLog,
    getCacheLogs,
    close: async () => sb.close()
  }
}

export { buildStore }
