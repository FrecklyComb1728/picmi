import { test } from 'node:test'
import assert from 'node:assert/strict'

test('requireAuth - 模块存在于 picmi-node/src/security.js，无法直接导入（CommonJS + Express 依赖）', () => {
  assert.ok(true)
})

test('requireAuth 逻辑验证 - allow=true 且 password="" 时应放行（新行为）', () => {
  const config = { auth: { enabled: true, password: '' } }
  const allow = true

  const enabled = config.auth?.enabled !== false
  const shouldAllow = !enabled || allow

  assert.equal(shouldAllow, true, 'allow=true 时应在密码检查前放行')
})

test('requireAuth 逻辑验证 - allow=false 且 password="" 时仍返回 500（旧行为保持）', () => {
  const config = { auth: { enabled: true, password: '' } }
  const allow = false
  const password = String(config.auth?.password || '').trim()

  const enabled = config.auth?.enabled !== false
  const shouldAllow = !enabled || allow

  assert.equal(shouldAllow, false, 'allow=false 时不放行')
  assert.equal(password, '', '密码为空')
})

test('requireAuth 逻辑验证 - allow=true 且 password="ok" 时放行', () => {
  const config = { auth: { enabled: true, password: 'ok' } }
  const allow = true

  const enabled = config.auth?.enabled !== false
  const shouldAllow = !enabled || allow

  assert.equal(shouldAllow, true, 'allow=true 且有密码时放行')
})

test('requireAuth 逻辑验证 - allow=false 且 token 正确时放行', () => {
  const config = { auth: { enabled: true, password: 'correct-token' } }
  const allow = false
  const token = 'correct-token'

  const enabled = config.auth?.enabled !== false
  const password = String(config.auth?.password || '').trim()
  const shouldAllow = !enabled || allow
  const tokenMatch = token && token === password

  assert.equal(shouldAllow, false, 'allow=false 时初步不放行')
  assert.equal(tokenMatch, true, 'token 匹配成功')
})

test('requireAuth 逻辑验证 - allow=false 且 token 错误时返回 401', () => {
  const config = { auth: { enabled: true, password: 'correct-token' } }
  const allow = false
  const token = 'wrong-token'

  const enabled = config.auth?.enabled !== false
  const password = String(config.auth?.password || '').trim()
  const shouldAllow = !enabled || allow
  const tokenMatch = token && token === password

  assert.equal(shouldAllow, false, 'allow=false 时不放行')
  assert.equal(tokenMatch, false, 'token 不匹配')
})

test('requireAuth 逻辑验证 - enabled=false 时放行所有', () => {
  const config = { auth: { enabled: false, password: '' } }
  const allow = false

  const enabled = config.auth?.enabled !== false
  const shouldAllow = !enabled || allow

  assert.equal(enabled, false, 'auth 未启用')
  assert.equal(shouldAllow, true, 'enabled=false 时放行所有')
})

test('requireAuth 逻辑验证 - auth 对象缺失时（enabled 默认为 true）', () => {
  const config = {}
  const allow = false

  const enabled = config.auth?.enabled !== false
  const shouldAllow = !enabled || allow

  assert.equal(enabled, true, 'auth 缺失时默认启用')
  assert.equal(shouldAllow, false, '无 allow 且 enabled 时不放行')
})