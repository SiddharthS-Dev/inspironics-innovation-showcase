/**
 * Auth store.
 *
 * This build ships without a server, so accounts, OTP codes and reset tokens are
 * kept in localStorage and every call goes through the async `api` object below.
 * Swapping in a real backend means replacing the bodies of those functions —
 * signatures, errors and the OTP/reset flow shape are already what a REST auth
 * service would expose.
 *
 * Google OAuth: set VITE_GOOGLE_CLIENT_ID to enable the real Google Identity
 * button; without it the button falls back to a clearly-labelled demo sign-in.
 */
const USERS_KEY = 'inspironics.auth.users.v1'
const SESSION_KEY = 'inspironics.auth.session.v1'
const PENDING_KEY = 'inspironics.auth.pending.v1'
const RESET_KEY = 'inspironics.auth.reset.v1'

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

const wait = (ms = 420) => new Promise((r) => setTimeout(r, ms))

const readJson = (k, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? 'null') ?? fallback
  } catch {
    return fallback
  }
}
const writeJson = (k, v) => localStorage.setItem(k, JSON.stringify(v))

/**
 * Non-cryptographic digest. Good enough to avoid storing a plaintext password in
 * a browser demo; a real deployment hashes server-side with bcrypt/argon2.
 */
const digest = (s) => {
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

const users = () => readJson(USERS_KEY, {})
const saveUsers = (u) => writeJson(USERS_KEY, u)
const norm = (e) => String(e || '').trim().toLowerCase()
const otp = () => String(Math.floor(100000 + Math.random() * 900000))

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function passwordIssues(pw) {
  const issues = []
  if ((pw || '').length < 8) issues.push('at least 8 characters')
  if (!/[A-Za-z]/.test(pw || '')) issues.push('a letter')
  if (!/\d/.test(pw || '')) issues.push('a number')
  return issues
}

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

    const code = otp()
    all[id] = {
      id,
      name: (name || '').trim() || id.split('@')[0],
      email: id,
      pw: digest(password),
      verified: false,
      role: 'owner',
      createdAt: new Date().toISOString(),
    }
    saveUsers(all)
    writeJson(PENDING_KEY, { email: id, code, expiresAt: Date.now() + 10 * 60 * 1000 })
    // A server would email this. Locally we surface it so the flow is completable.
    return { email: id, devCode: code }
  },

  getPendingVerification() {
    const p = readJson(PENDING_KEY, null)
    if (!p || p.expiresAt < Date.now()) return null
    return p
  },

  async resendOtp(email) {
    await wait()
    const id = norm(email)
    if (!users()[id]) throw new Error('No pending registration for that email.')
    const code = otp()
    writeJson(PENDING_KEY, { email: id, code, expiresAt: Date.now() + 10 * 60 * 1000 })
    return { email: id, devCode: code }
  },

  async verifyOtp({ email, code }) {
    await wait()
    const id = norm(email)
    const p = readJson(PENDING_KEY, null)
    if (!p || p.email !== id) throw new Error('No verification in progress for that email.')
    if (p.expiresAt < Date.now()) throw new Error('That code has expired — request a new one.')
    if (String(code).trim() !== p.code) throw new Error('That code is not correct.')

    const all = users()
    if (!all[id]) {
      // a verification can outlive its account if storage was cleared in part,
      // or edited from another tab; drop the dead code rather than throw raw
      localStorage.removeItem(PENDING_KEY)
      throw new Error('That account no longer exists — please register again.')
    }
    all[id].verified = true
    saveUsers(all)
    localStorage.removeItem(PENDING_KEY)
    return startSession(all[id])
  },

  async login({ email, password }) {
    await wait()
    const id = norm(email)
    const u = users()[id]
    if (!u || u.pw !== digest(password)) throw new Error('Email or password is incorrect.')
    if (!u.verified) {
      const code = otp()
      writeJson(PENDING_KEY, { email: id, code, expiresAt: Date.now() + 10 * 60 * 1000 })
      const err = new Error('This account is not verified yet.')
      err.code = 'UNVERIFIED'
      err.email = id
      err.devCode = code
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
    return startSession({ id: 'guest', email: 'guest@inspironics.net', name: 'Guest', role: 'guest', verified: true }, true)
  },

  async requestPasswordReset(email) {
    await wait()
    const id = norm(email)
    const token = otp()
    // Always succeeds, so the response cannot be used to enumerate accounts.
    if (users()[id]) writeJson(RESET_KEY, { email: id, token, expiresAt: Date.now() + 15 * 60 * 1000 })
    return { email: id, devToken: users()[id] ? token : null }
  },

  getPendingReset() {
    const r = readJson(RESET_KEY, null)
    if (!r || r.expiresAt < Date.now()) return null
    return r
  },

  async resetPassword({ email, token, password }) {
    await wait()
    const id = norm(email)
    const r = readJson(RESET_KEY, null)
    if (!r || r.email !== id) throw new Error('No reset in progress for that email.')
    if (r.expiresAt < Date.now()) throw new Error('That reset code has expired.')
    if (String(token).trim() !== r.token) throw new Error('That reset code is not correct.')
    const issues = passwordIssues(password)
    if (issues.length) throw new Error(`Password needs ${issues.join(', ')}.`)

    const all = users()
    if (!all[id]) {
      localStorage.removeItem(RESET_KEY)
      throw new Error('That account no longer exists — please register again.')
    }
    all[id].pw = digest(password)
    all[id].verified = true
    saveUsers(all)
    localStorage.removeItem(RESET_KEY)
    return { email: id }
  },

  logout() {
    localStorage.removeItem(SESSION_KEY)
  },
}

function startSession(user, isGuest = false) {
  const session = {
    user: { id: user.id, email: user.email, name: user.name, picture: user.picture, role: user.role || 'owner' },
    isGuest,
    issuedAt: Date.now(),
    expiresAt: Date.now() + (isGuest ? 12 : 24 * 7) * 60 * 60 * 1000,
  }
  writeJson(SESSION_KEY, session)
  return session
}
