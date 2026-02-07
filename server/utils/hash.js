import crypto from 'crypto'

const hashLegacySha256 = (value) => {
  return crypto.createHash('sha256').update(value).digest('hex')
}

const scryptParams = () => {
  const N = Math.max(16384, Number(process.env.PICMI_SCRYPT_N ?? 0) || 16384)
  const r = Math.max(8, Number(process.env.PICMI_SCRYPT_R ?? 0) || 8)
  const p = Math.max(1, Number(process.env.PICMI_SCRYPT_P ?? 0) || 1)
  const keyLen = Math.max(32, Number(process.env.PICMI_SCRYPT_KEYLEN ?? 0) || 32)
  return { N, r, p, keyLen }
}

const hashPassword = (value) => {
  const salt = crypto.randomBytes(16)
  const { N, r, p, keyLen } = scryptParams()
  const derived = crypto.scryptSync(String(value), salt, keyLen, { N, r, p })
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${derived.toString('base64url')}`
}

const verifyPassword = (password, storedHash) => {
  const raw = String(storedHash ?? '')
  if (raw.startsWith('scrypt$')) {
    const parts = raw.split('$')
    if (parts.length !== 6) return false
    const N = Number(parts[1])
    const r = Number(parts[2])
    const p = Number(parts[3])
    const salt = Buffer.from(parts[4], 'base64url')
    const expected = Buffer.from(parts[5], 'base64url')
    const keyLen = expected.length
    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p) || salt.length === 0 || expected.length === 0) return false
    const derived = crypto.scryptSync(String(password), salt, keyLen, { N, r, p })
    return crypto.timingSafeEqual(derived, expected)
  }
  return hashLegacySha256(String(password)) === raw
}

const needsRehash = (storedHash) => {
  return !String(storedHash ?? '').startsWith('scrypt$')
}

export { hashPassword, verifyPassword, needsRehash }
