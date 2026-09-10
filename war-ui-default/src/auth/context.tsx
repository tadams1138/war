// Auth state (JWT held in memory only — the spec).
// The token itself lives in api/authState.ts (a plain module, so
// api/client.ts can read/write it outside React); this provider mirrors
// "is there a token" into React state so components can react to it, and
// registers the unauthorized handler that implements the terminal
// failed-refresh redirect.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { logout as apiLogout } from '../api/client'
import { getToken, registerUnauthorizedHandler, setToken } from '../api/authState'
import { useAuthTestHooks } from '../mocks/authTestHooks'
import { loginUrlFor } from './returnTo'

interface AuthContextValue {
  isAuthenticated: boolean
  login: (token: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function returnToFromLocation(): string {
  return window.location.pathname + window.location.search
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => getToken() !== null)
  const navigate = useNavigate()

  const login = useCallback((token: string) => {
    setToken(token)
    setIsAuthenticated(true)
  }, [])

  // Logout always succeeds from the voter's point of view: the local state
  // change happens unconditionally and is never gated, delayed, or
  // reversed by DELETE /auth/session's outcome. The request is still
  // attempted best-effort — apiLogout() clears the token itself and never
  // rejects (api/client.ts), but the `catch` below is a second guard
  // against an unhandled rejection should that ever change.
  const logout = useCallback(() => {
    setIsAuthenticated(false)
    navigate('/')
    void apiLogout().catch(() => undefined)
  }, [navigate])

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      setIsAuthenticated(false)
      // reason=session-expired lets /login show "Please log in to
      // continue" — the page that triggered the 401 is about to be
      // torn down by this navigation, so it cannot reliably show that
      // message itself.
      navigate(loginUrlFor(returnToFromLocation(), 'session-expired'))
    })
    return () => registerUnauthorizedHandler(null)
  }, [navigate])

  useAuthTestHooks(login, navigate)

  const value = useMemo(() => ({ isAuthenticated, login, logout }), [isAuthenticated, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
