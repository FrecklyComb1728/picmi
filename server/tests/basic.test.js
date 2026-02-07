import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePath } from '../utils/paths.js'
import { hashPassword, needsRehash, verifyPassword } from '../utils/hash.js'

test('normalizePath', () => {
  assert.equal(normalizePath(''), '/')
  assert.equal(normalizePath('/a//b'), '/a/b')
  assert.equal(normalizePath('a/../b'), '/b')
})

test('hashPassword', () => {
  const hash = hashPassword('picmi')
  assert.ok(hash.startsWith('scrypt$'))
  assert.equal(verifyPassword('picmi', hash), true)
  assert.equal(verifyPassword('wrong', hash), false)
  assert.equal(needsRehash(hash), false)
  assert.equal(needsRehash('0'.repeat(64)), true)
})
