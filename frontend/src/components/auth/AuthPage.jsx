import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/useAuth'
import './AuthPage.css'

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register'
  const { user, loading, authError, login, register } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (loading) return <div className="auth-loading">Loading your workspace…</div>
  if (user) return <Navigate to="/dashboard" replace />

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      if (isRegister) await register(name.trim(), email.trim(), password)
      else await login(email.trim(), password)
      navigate('/dashboard', { replace: true })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <Link className="auth-brand" to="/login">
          <span className="brand-mark">C</span>
          <span><strong>CareerForge</strong><small>Career OS</small></span>
        </Link>
        <p className="eyebrow">{isRegister ? 'Your next chapter starts here' : 'Welcome back'}</p>
        <h1>{isRegister ? 'Create your account' : 'Sign in to CareerForge'}</h1>
        <p className="auth-subtitle">
          {isRegister ? 'Build skills, find opportunities, and keep your career journey in one place.' : 'Pick up where you left off and keep moving forward.'}
        </p>
        <form className="auth-form" onSubmit={handleSubmit}>
          {isRegister && (
            <label>
              Full name
              <input autoComplete="name" minLength="2" required value={name} onChange={(event) => setName(event.target.value)} />
            </label>
          )}
          <label>
            Email address
            <input autoComplete="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={8} type="password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {(error || authError) && <p className="auth-error" role="alert">{error || authError}</p>}
          <button type="submit" className="primary-btn auth-submit" disabled={submitting}>
            {submitting ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <p className="auth-switch">
          {isRegister ? 'Already have an account?' : 'New to CareerForge?'}{' '}
          <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link>
        </p>
        <p className="auth-note">Your account and applications are stored securely in your local CareerForge database.</p>
      </section>
    </main>
  )
}
