import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api } from '../lib/auth'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    const s = api.getSession()
    return s && s.expiresAt > Date.now() ? s : null
  })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const s = api.getSession()
    if (s && s.expiresAt <= Date.now()) api.logout()
    setReady(true)
  }, [])

  const logout = useCallback(() => {
    api.logout()
    setSession(null)
  }, [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      isGuest: !!session?.isGuest,
      ready,
      setSession,
      logout,
    }),
    [session, ready, logout]
  )

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Gates the showcase behind a session, remembering where the visitor was headed. */
export function ProtectedRoute({ children }) {
  const { session, ready } = useAuth()
  const location = useLocation()

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink">
        <div className="h-10 w-10 animate-spinSlow rounded-full border-2 border-white/10 border-t-cyan-glow" />
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return children
}
