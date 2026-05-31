import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { setAuthCookieConfig, createAuthCookieValue, parseAuthCookieValue } from '../utils/auth-cookie.js'

const sha256 = (s) => crypto.createHash('sha256').update(s).digest()

test('setAuthCookieConfig - valid secret produces working encrypt/decrypt', () => {
  setAuthCookieConfig({ cookieSecret: 'my-test-secret-key' })
  const value = createAuthCookieValue({ u: 'alice' })
  const parsed = parseAuthCookieValue(value)
  assert.ok(parsed)
  assert.equal(parsed.u, 'alice')
  assert.ok(typeof parsed.exp === 'number')
  assert.ok(parsed.exp > Date.now())
})

test('setAuthCookieConfig - different secrets produce incompatible tokens', () => {
  setAuthCookieConfig({ cookieSecret: 'secret-alpha' })
  const tokenA = createAuthCookieValue({ u: 'alpha' })

  setAuthCookieConfig({ cookieSecret: 'secret-beta' })
  const tokenB = createAuthCookieValue({ u: 'beta' })

  assert.ok(parseAuthCookieValue(tokenB))
  assert.equal(parseAuthCookieValue(tokenA), null)
})

test('setAuthCookieConfig - empty secret in non-production uses default key', () => {
  const origEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'

  try {
    assert.doesNotThrow(() => {
      setAuthCookieConfig({ cookieSecret: '' })
    })

    const expectedKey = sha256('picmi-dev-default-secret')
    const value = createAuthCookieValue({ u: 'default-user' })
    const parsed = parseAuthCookieValue(value)
    assert.ok(parsed)
    assert.equal(parsed.u, 'default-user')
  } finally {
    process.env.NODE_ENV = origEnv
  }
})

test('setAuthCookieConfig - empty secret in production throws', () => {
  const origEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'

  try {
    assert.throws(
      () => {
        setAuthCookieConfig({ cookieSecret: '' })
      },
      { message: 'auth.cookieSecret 未配置' }
    )
  } finally {
    process.env.NODE_ENV = origEnv
  }
})

test('setAuthCookieConfig - whitespace-only secret in production throws', () => {
  const origEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'

  try {
    assert.throws(
      () => {
        setAuthCookieConfig({ cookieSecret: '   ' })
      },
      { message: 'auth.cookieSecret 未配置' }
    )
  } finally {
    process.env.NODE_ENV = origEnv
  }
})

test('createAuthCookieValue / parseAuthCookieValue - roundtrip with various payloads', () => {
  setAuthCookieConfig({ cookieSecret: 'roundtrip-key' })

  const payloads = [
    { u: 'user-001' },
    { u: 'admin', role: 'super' },
    { u: 'x'.repeat(100) }
  ]

  for (const payload of payloads) {
    const value = createAuthCookieValue(payload)
    const parsed = parseAuthCookieValue(value)
    assert.ok(parsed)
    assert.equal(parsed.u, payload.u)
    assert.ok(parsed.exp > Date.now() + 50_000)
  }
})

test('parseAuthCookieValue - null/undefined/empty returns null', () => {
  setAuthCookieConfig({ cookieSecret: 'null-test' })
  assert.equal(parseAuthCookieValue(null), null)
  assert.equal(parseAuthCookieValue(undefined), null)
  assert.equal(parseAuthCookieValue(''), null)
})

test('parseAuthCookieValue - invalid base64 returns null', () => {
  setAuthCookieConfig({ cookieSecret: 'invalid-test' })
  assert.equal(parseAuthCookieValue('!!!not-valid-base64!!!'), null)
  assert.equal(parseAuthCookieValue('abc'), null)
  assert.equal(parseAuthCookieValue('YWJj'), null)
})

test('parseAuthCookieValue - too short raw bytes returns null', () => {
  setAuthCookieConfig({ cookieSecret: 'short-test' })
  const shortBase64 = Buffer.from('short').toString('base64url')
  assert.equal(parseAuthCookieValue(shortBase64), null)
})

test('parseAuthCookieValue - tampered token returns null', () => {
  setAuthCookieConfig({ cookieSecret: 'tamper-key' })
  const value = createAuthCookieValue({ u: 'honest' })
  const raw = Buffer.from(value, 'base64url')
  raw[raw.length - 1] ^= 0xff
  const tampered = raw.toString('base64url')
  assert.equal(parseAuthCookieValue(tampered), null)
})

test('parseAuthCookieValue - expired token returns null', () => {
  const origEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'

  try {
    mock.timers.enable({ apis: ['Date'] })
    try {
      setAuthCookieConfig({ cookieSecret: 'expire-key', maxAgeSeconds: 60 })
      const value = createAuthCookieValue({ u: 'ephemeral' })

      assert.ok(parseAuthCookieValue(value))
      mock.timers.tick(120_000)
      assert.equal(parseAuthCookieValue(value), null)
    } finally {
      mock.timers.reset()
    }
  } finally {
    process.env.NODE_ENV = origEnv
  }
})

test('setAuthCookieConfig - maxAgeSeconds below minimum clamps to 60', () => {
  setAuthCookieConfig({ cookieSecret: 'clamp-key', maxAgeSeconds: 1 })
  const value = createAuthCookieValue({ u: 'clamp' })
  const parsed = parseAuthCookieValue(value)
  assert.ok(parsed)
  assert.ok(parsed.exp > Date.now() + 50_000)
  assert.ok(parsed.exp <= Date.now() + 70_000)
})

test('setAuthCookieConfig - maxAgeSeconds NaN uses default 7 days', () => {
  setAuthCookieConfig({ cookieSecret: 'nan-key', maxAgeSeconds: 'not-a-number' })
  const value = createAuthCookieValue({ u: 'nan' })
  const parsed = parseAuthCookieValue(value)
  assert.ok(parsed)
  assert.ok(parsed.exp > Date.now() + 6 * 24 * 60 * 60 * 1000)
})