/**
 * Auth store.
 *
 * This build ships without a server, so accounts, OTP codes and reset tokens
 * live in localStorage and every call goes through the async `api` object
 * below. Swapping in a real backend means replacing the bodies of those
 * functions — signatures, errors and the OTP/reset flow shape are already what
 * a REST auth service would expose.
 *
 * What is *not* pretend, because there was no reason for it to be:
 *
 *  - Passwords are stretched with PBKDF2-HMAC-SHA256 over a per-account salt,
 *    through WebCrypto. Accounts created by earlier builds carry a plain
 *    64-bit digest; they are verified against it once and upgraded in place on
 *    the next successful sign-in.
 *  - Verification and reset codes are stored only as salted PBKDF2 hashes, and
 *    every check is attempt-limited, so a stored token is not a usable secret.
 *  - Comparisons run in constant time, so a near-miss does not leak how much
 *    of the value was right.
 *
 * The one deliberate hole is `getDemoCode()`. Nothing here can send email, so
 * the six-digit code has to be visible for the flow to be completable at all.
 * It is kept under its own storage key, separate from the record the checks
 * actually trust, so a real deployment deletes one constant and one accessor.
 *
 * Google OAuth: set VITE_GOOGLE_CLIENT_ID to enable the real Google Identity
 * button; without it the button falls back to a clearly-labelled demo sign-in.
 */
const USERS_KEY = 'inspironics.auth.users.v1'
const PENDING_KEY = 'inspironics.auth.pending.v1'
const RESET_KEY = 'inspironics.auth.reset.v1'
const DEMO_KEY = 'inspironics.auth.democode.v1'

/** Exported so AuthContext can tell which cross-tab storage events matter. */
export const SESSION_KEY = 'inspironics.auth.session.v1'

// `import.meta.env` only exists under Vite; the optional chain keeps this
// module importable from plain Node, which is what the unit tests do.
export const GOOGLE_CLIENT_ID = import.meta.env?.VITE_GOOGLE_CLIENT_ID || ''

const OTP_TTL = 10 * 60 * 1000
const RESET_TTL = 15 * 60 * 1000
const MAX_ATTEMPTS = 5
const PBKDF2_ITERATIONS = 210000

const wait = (ms = 420) => new Promise((r) => setTimeout(r, ms))

const readJson = (k, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? 'null') ?? fallback
  } catch {
    return fallback
  }
}
const writeJson = (k, v) => localStorage.setItem(k, JSON.stringify(v))

const users = () => readJson(USERS_KEY, {})
const saveUsers = (u) => writeJson(USERS_KEY, u)
const norm = (e) => String(e || '').trim().toLowerCase()
const otp = () => String(Math.floor(100000 + Math.random() * 900000))

/* ------------------------------------------------------------- crypto ---- */

const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined
const encoder = new TextEncoder()
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

const randomSalt = (bytes = 16) => toHex(crypto.getRandomValues(new Uint8Array(bytes)))

/**
 * Legacy, non-cryptographic digest. Kept only to verify accounts created
 * before PBKDF2 landed, and as the fallback on insecure origins where
 * WebCrypto's subtle API is unavailable.
 */
const legacyDigest = (s) => {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

let warnedInsecure = false

async function pbkdf2(secret, salt, iterations = PBKDF2_ITERATIONS) {
  if (!subtle) {
    // http:// origins other than localhost have no crypto.subtle at all. Fall
    // back rather than break sign-in, but say so — this is not equivalent.
    if (!warnedInsecure) {
      warnedInsecure = true
      console.warn('crypto.subtle unavailable (insecure origin) — falling back to a weak password digest.')
    }
    return legacyDigest(salt + ':' + secret)
  }
  const key = await subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveBits'])
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations },
    key,
    256
  )
  return toHex(bits)
}

/** Length-then-content compare that does not short-circuit on the first byte. */
function sameHash(a = '', b = '') {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const KDF = 'pbkdf2-sha256'

async function setPassword(user, password) {
  user.salt = randomSalt()
  user.iterations = PBKDF2_ITERATIONS
  user.kdf = KDF
  user.pw = await pbkdf2(password, user.salt, user.iterations)
  return user
}

async function passwordMatches(user, password) {
  if (user.kdf === KDF) return sameHash(user.pw, await pbkdf2(password, user.salt, user.iterations))
  return sameHash(user.pw, legacyDigest(password))
}

/* --------------------------------------------------------------- codes --- */

const clearToken = (key) => {
  localStorage.removeItem(key)
  localStorage.removeItem(DEMO_KEY)
}

/** Issue a six-digit code, storing only its hash plus an attempt counter. */
async function issueCode(key, email, ttl) {
  const code = otp()
  const salt = randomSalt(8)
  writeJson(key, {
    email,
    salt,
    hash: await pbkdf2(code, salt),
    attempts: 0,
    expiresAt: Date.now() + ttl,
  })
  writeJson(DEMO_KEY, { email, code }) // demo-only: see the module comment
  return code
}

/**
 * Check a submitted code against the stored hash, counting failures and
 * burning the token once they run out.
 */
async function checkCode(key, email, code, missingMessage) {
  const rec = readJson(key, null)
  if (!rec || rec.email !== email) throw new Error(missingMessage)
  if (rec.expiresAt < Date.now()) {
    clearToken(key)
    throw new Error('That code has expired — request a new one.')
  }
  if ((rec.attempts || 0) >= MAX_ATTEMPTS) {
    clearToken(key)
    throw new Error('Too many incorrect attempts — request a new code.')
  }
  if (!sameHash(rec.hash, await pbkdf2(String(code).trim(), rec.salt))) {
    rec.attempts = (rec.attempts || 0) + 1
    const left = MAX_ATTEMPTS - rec.attempts
    if (left <= 0) {
      clearToken(key)
      throw new Error('Too many incorrect attempts — request a new code.')
    }
    writeJson(key, rec)
    throw new Error(`That code is not correct — ${left} attempt${left === 1 ? '' : 's'} left.`)
  }
  return rec
}

const livePending = (key) => {
  const rec = readJson(key, null)
  if (!rec || rec.expiresAt < Date.now()) return null
  return { email: rec.email, expiresAt: rec.expiresAt }
}

/* ------------------------------------------------------------ validation - */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function passwordIssues(pw) {
  const issues = []
  if ((pw || '').length < 8) issues.push('at least 8 characters')
  if (!/[A-Za-z]/.test(pw || '')) issues.push('a letter')
  if (!/\d/.test(pw || '')) issues.push('a number')
  return issues
}

/* ------------------------------------------------------------------ api -- */

export const api = {
  getSession() {
    return readJson(SESSION_KEY, null)
  },

  async register({ name, email, password }) {
    await wait()
    const id = norm(email)
    if (!EMAIL_RE.test(id)) throw new Error('Enter a valid email address.')
    const issues = passwordIssues(password)
    if (issues.length) throw new Error(`Password needs ${issues.join(', ')}.`)
    const all = users()
    if (all[id]?.verified) throw new Error('An account with that email already exists.')

    all[id] = await setPassword(
      {
        id,
        name: (name || '').trim() || id.split('@')[0],
        email: id,
        verified: false,
        role: 'owner',
        createdAt: new Date().toISOString(),
      },
      password
    )
    saveUsers(all)
    const devCode = await issueCode(PENDING_KEY, id, OTP_TTL)
    // A server would email this. Locally we surface it so the flow completes.
    return { email: id, devCode }
  },

  /** Live verification in progress, if any. Never returns the code itself. */
  getPendingVerification() {
    return livePending(PENDING_KEY)
  },

  /**
   * Demo affordance: the plaintext code, so a page reload can still show it.
   * A deployment with a mail service deletes this and the DEMO_KEY write.
   */
  getDemoCode(email) {
    const rec = readJson(DEMO_KEY, null)
    if (!rec || (email && rec.email !== norm(email))) return ''
    return rec.code || ''
  },

  async resendOtp(email) {
    await wait()
    const id = norm(email)
    if (!users()[id]) throw new Error('No pending registration for that email.')
    return { email: id, devCode: await issueCode(PENDING_KEY, id, OTP_TTL) }
  },

  async verifyOtp({ email, code }) {
    await wait()
    const id = norm(email)
    await checkCode(PENDING_KEY, id, code, 'No verification in progress for that email.')

    const all = users()
    if (!all[id]) {
      // a verification can outlive its account if storage was cleared in part,
      // or edited from another tab; drop the dead token rather than throw raw
      clearToken(PENDING_KEY)
      throw new Error('That account no longer exists — please register again.')
    }
    all[id].verified = true
    saveUsers(all)
    clearToken(PENDING_KEY)
    return startSession(all[id])
  },

  async login({ email, password }) {
    await wait()
    const id = norm(email)
    const all = users()
    const u = all[id]
    if (!u || !(await passwordMatches(u, password))) throw new Error('Email or password is incorrect.')

    if (u.kdf !== KDF) {
      // right password against a legacy digest: re-stretch it properly now
      await setPassword(u, password)
      saveUsers(all)
    }

    if (!u.verified) {
      const err = new Error('This account is not verified yet.')
      err.code = 'UNVERIFIED'
      err.email = id
      err.devCode = await issueCode(PENDING_KEY, id, OTP_TTL)
      throw err
    }
    return startSession(u)
  },

  async loginWithGoogle(profile) {
    await wait(260)
    const id = norm(profile?.email || 'google.user@inspironics.net')
    const all = users()
    all[id] = {
      ...(all[id] || {}),
      id,
      email: id,
      name: profile?.name || all[id]?.name || id.split('@')[0],
      picture: profile?.picture || all[id]?.picture,
      verified: true,
      provider: 'google',
      role: all[id]?.role || 'owner',
      createdAt: all[id]?.createdAt || new Date().toISOString(),
    }
    saveUsers(all)
    return startSession(all[id])
  },

  async guest() {
    await wait(160)
    return startSession(
      { id: 'guest', email: 'guest@inspironics.net', name: 'Guest', role: 'guest', verified: true },
      true
    )
  },

  async requestPasswordReset(email) {
    await wait()
    const id = norm(email)
    // Always succeeds, so the response cannot be used to enumerate accounts.
    if (!users()[id]) return { email: id, devToken: null }
    return { email: id, devToken: await issueCode(RESET_KEY, id, RESET_TTL) }
  },

  getPendingReset() {
    return livePending(RESET_KEY)
  },

  async resetPassword({ email, token, password }) {
    await wait()
    const id = norm(email)
    await checkCode(RESET_KEY, id, token, 'No reset in progress for that email.')
    const issues = passwordIssues(password)
    if (issues.length) throw new Error(`Password needs ${issues.join(', ')}.`)

    const all = users()
    if (!all[id]) {
      clearToken(RESET_KEY)
      throw new Error('That account no longer exists — please register again.')
    }
    await setPassword(all[id], password)
    all[id].verified = true
    saveUsers(all)
    clearToken(RESET_KEY)
    return { email: id }
  },

  logout() {
    localStorage.removeItem(SESSION_KEY)
  },
}

function startSession(user, isGuest = false) {
  const session = {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      role: user.role || 'owner',
    },
    isGuest,
    issuedAt: Date.now(),
    expiresAt: Date.now() + (isGuest ? 12 : 24 * 7) * 60 * 60 * 1000,
  }
  writeJson(SESSION_KEY, session)
  return session
}
