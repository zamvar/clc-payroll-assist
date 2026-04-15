'use client'

import { useState, FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function LoginForm() {
  const params = useSearchParams()
  const from = params.get('from') || '/'

  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json() as { ok: boolean; error?: string }

      if (data.ok) {
        // Hard navigation — ensures proxy sees the newly-set cookie
        window.location.href = from
      } else {
        setError(data.error ?? 'Incorrect password')
        setPassword('')
        setLoading(false)
      }
    } catch {
      setError('Network error — could not reach server')
      setLoading(false)
    }
  }

  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
    }}>
      <div style={{ width: '100%', maxWidth: '360px' }}>

        {/* Logo */}
        <div style={{ marginBottom: '2.5rem' }}>
          <p style={{
            fontFamily: 'var(--font-dm-mono, "DM Mono")',
            fontSize: '0.62rem',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
            marginBottom: '0.25rem',
          }}>
            CLC Payroll System
          </p>
          <h1 style={{
            fontSize: 'clamp(1.5rem, 5vw, 2rem)',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 1,
            color: 'var(--ink)',
            margin: 0,
          }}>
            Payroll <span style={{ color: 'var(--amber-deep)' }}>Dispatch</span>
          </h1>
        </div>

        {/* Divider */}
        <div style={{
          borderTop: '2px solid var(--ink)',
          marginBottom: '2rem',
        }} />

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="field-group">
            <label className="field-label" htmlFor="password">
              Access Password
            </label>
            <input
              id="password"
              className="field-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              autoFocus
              disabled={loading}
              required
            />
          </div>

          {error && (
            <div style={{
              fontFamily: 'var(--font-dm-mono)',
              fontSize: '0.72rem',
              color: 'var(--red)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              {error}
            </div>
          )}

          <button
            className="btn-primary"
            type="submit"
            disabled={loading || !password}
            style={{ marginTop: '0.5rem', fontSize: '1rem' }}
          >
            {loading ? (
              <svg
                style={{ animation: 'spin 0.8s linear infinite' }}
                width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={2}
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Footer note */}
        <p style={{
          fontFamily: 'var(--font-dm-mono)',
          fontSize: '0.62rem',
          color: 'var(--ink-faint)',
          marginTop: '2rem',
          lineHeight: 1.6,
        }}>
          This system is for authorized HR personnel only.<br />
          Session expires after 8 hours.
        </p>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
