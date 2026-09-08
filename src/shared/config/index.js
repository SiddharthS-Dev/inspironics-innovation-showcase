/**
 * One place for everything the app reads from the environment or treats as a
 * tunable constant.
 *
 * Nothing else in the codebase touches `import.meta.env`, so the set of things
 * a deployment can change is exactly the shape of `env` below — no hunting for
 * a stray flag in a component. The optional chain matters: `import.meta.env`
 * only exists under Vite, and the unit tests import these modules from plain
 * Node.
 */
const raw = import.meta.env ?? {}

const asOptionalString = (value) => {
  const str = typeof value === 'string' ? value.trim() : ''
  return str || ''
}

const asOptionalUrl = (value) => {
  const str = asOptionalString(value)
  if (!str) return ''

  try {
    const url = new URL(str)
    return url.toString()
  } catch {
    return ''
  }
}

export const env = {
  /** Enables the real Google Identity button; falsy falls back to a demo sign-in. */
  googleClientId: asOptionalString(raw.VITE_GOOGLE_CLIENT_ID),
  mode: raw.MODE || 'production',
  isDev: !!raw.DEV,
  /** POST target for `shared/lib/reporter`. Unset means log-only. */
  errorEndpoint: asOptionalUrl(raw.VITE_ERROR_ENDPOINT),
}

/**
 * localStorage keys, versioned in the name.
 *
 * Bump the suffix when a stored shape changes incompatibly: an old value then
 * simply reads as absent rather than as corrupt.
 */
export const storageKeys = {
  authUsers: 'inspironics.auth.users.v1',
  authSession: 'inspironics.auth.session.v1',
  authPending: 'inspironics.auth.pending.v1',
  authReset: 'inspironics.auth.reset.v1',
  authDemoCode: 'inspironics.auth.democode.v1',
  customItems: 'inspironics.customItems.v1',
  explorerQuality: 'inspironics.explorer.quality.v1',
}

/** Auth policy. A server would own these; they live here until one does. */
export const authPolicy = {
  otpTtlMs: 10 * 60 * 1000,
  resetTtlMs: 15 * 60 * 1000,
  maxCodeAttempts: 5,
  /** OWASP's floor for PBKDF2-HMAC-SHA256. */
  pbkdf2Iterations: 210000,
  sessionHours: 24 * 7,
  guestSessionHours: 12,
}

/** Where the corpus and its images come from. */
export const showcaseConfig = {
  dataUrl: '/data/showcase.json',
  imageBase: '/images',
  pageSize: 48,
}
