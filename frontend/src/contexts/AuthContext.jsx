import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../services/api'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('careerforge_token'))
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('careerforge_token')))
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    if (!token) return undefined

    let active = true
    apiRequest('/auth/me', { token })
      .then((profile) => {
        if (active) {
          setUser(profile)
          setAuthError('')
        }
      })
      .catch((error) => {
        if (active) {
          setUser(null)
          setAuthError(error.message)
          setLoading(false)
          if (error.status === 401) {
            localStorage.removeItem('careerforge_token')
            setToken(null)
          }
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [token])

  const authenticate = async (endpoint, payload) => {
    const result = await apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    localStorage.setItem('careerforge_token', result.access_token)
    setAuthError('')
    setUser(result.user)
    setToken(result.access_token)
  }

  const login = (email, password) => authenticate('/auth/login', { email, password })
  const register = (name, email, password) => authenticate('/auth/register', { name, email, password })
  const refreshUser = useCallback(async () => {
    const profile = await apiRequest('/auth/me', { token })
    setUser(profile)
    setAuthError('')
    return profile
  }, [token])
  const logout = () => {
    localStorage.removeItem('careerforge_token')
    setToken(null)
    setUser(null)
  }

  const value = useMemo(
    () => ({ token, user, loading, authError, login, register, refreshUser, logout }),
    [token, user, loading, authError, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
