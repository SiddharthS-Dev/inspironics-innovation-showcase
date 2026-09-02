import { Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, ProtectedRoute } from '#features/auth'
import Loader from '#shared/ui/Loader'
import ErrorBoundary from '#shared/ui/ErrorBoundary'
import { routes } from './routes.jsx'

/**
 * Composition root.
 *
 * This is the one place allowed to know about every feature at once: it wires
 * the providers, the error boundary, the suspense fallback and the route table
 * together, and does nothing else.
 */
export default function App() {
  return (
    <ErrorBoundary label="showcase">
      <AuthProvider>
        <div className="grid-backdrop" aria-hidden="true" />
        <Suspense fallback={<Loader label="Preparing the showcase" />}>
          <Routes>
            {routes.map(({ path, Component, protected: isProtected }) => (
              <Route
                key={path}
                path={path}
                element={
                  isProtected ? (
                    <ProtectedRoute>
                      <Component />
                    </ProtectedRoute>
                  ) : (
                    <Component />
                  )
                }
              />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </ErrorBoundary>
  )
}
