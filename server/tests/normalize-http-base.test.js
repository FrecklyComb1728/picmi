import { test } from 'node:test'
import assert from 'node:assert/strict'

const normalizeHttpBase = (address) => {
  const raw = String(address ?? '').trim()
  if (!raw) return null
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : `http://${raw}`
  try {
    const url = new URL(withScheme)
    if (url.username || url.password) return null
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

test('normalizeHttpBase - http://localhost:8080 不被拒绝', () => {
  const result = normalizeHttpBase('http://localhost:8080')
  assert.equal(result, 'http://localhost:8080')
})

test('normalizeHttpBase - http://127.0.0.1:3000 不被拒绝', () => {
  const result = normalizeHttpBase('http://127.0.0.1:3000')
  assert.equal(result, 'http://127.0.0.1:3000')
})

test('normalizeHttpBase - http://example.com 正常返回 origin', () => {
  const result = normalizeHttpBase('http://example.com')
  assert.equal(result, 'http://example.com')
})

test('normalizeHttpBase - https://example.com 正常返回 origin', () => {
  const result = normalizeHttpBase('https://example.com')
  assert.equal(result, 'https://example.com')
})

test('normalizeHttpBase - 无协议的地址自动补 http://', () => {
  const result = normalizeHttpBase('192.168.1.1:9090')
  assert.equal(result, 'http://192.168.1.1:9090')
})

test('normalizeHttpBase - 无效 URL 返回 null', () => {
  assert.equal(normalizeHttpBase(':::invalid:::/url'), null)
})

test('normalizeHttpBase - 空字符串返回 null', () => {
  assert.equal(normalizeHttpBase(''), null)
})

test('normalizeHttpBase - null 返回 null', () => {
  assert.equal(normalizeHttpBase(null), null)
})

test('normalizeHttpBase - undefined 返回 null', () => {
  assert.equal(normalizeHttpBase(undefined), null)
})

test('normalizeHttpBase - 带用户名密码的 URL 返回 null', () => {
  assert.equal(normalizeHttpBase('http://user:pass@example.com'), null)
})

test('normalizeHttpBase - 只有用户名的 URL 返回 null', () => {
  assert.equal(normalizeHttpBase('http://admin@example.com'), null)
})

test('normalizeHttpBase - 非 http/https 协议返回 null', () => {
  assert.equal(normalizeHttpBase('ftp://example.com'), null)
})

test('normalizeHttpBase - ws:// 协议返回 null', () => {
  assert.equal(normalizeHttpBase('ws://example.com'), null)
})

test('normalizeHttpBase - 带路径的 URL 只返回 origin', () => {
  const result = normalizeHttpBase('http://example.com/path/to/resource?q=1')
  assert.equal(result, 'http://example.com')
})

test('normalizeHttpBase - 带端口和路径的 URL 只返回 origin', () => {
  const result = normalizeHttpBase('https://example.com:8443/api/test')
  assert.equal(result, 'https://example.com:8443')
})

test('normalizeHttpBase - 前后空格被修剪', () => {
  const result = normalizeHttpBase('  http://example.com  ')
  assert.equal(result, 'http://example.com')
})