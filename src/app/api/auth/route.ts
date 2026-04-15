import { NextRequest, NextResponse } from 'next/server'

/** SHA-256 of password + secret pepper — matches proxy.ts exactly */
async function hashPassword(password: string): Promise<string> {
  const secret = process.env.COOKIE_SECRET || 'dev-secret-change-in-prod'
  const enc = new TextEncoder()
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(password + ':' + secret))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── Rate limiter (in-memory — works because Render is a persistent server) ──
const MAX_ATTEMPTS = 5
const WINDOW_MS    = 15 * 60 * 1000  // 15 minutes
const LOCKOUT_MS   = 15 * 60 * 1000  // 15 minutes

interface RateEntry {
  attempts: number
  windowStart: number
  lockedUntil: number | null
}

const rateMap = new Map<string, RateEntry>()

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

/** Returns ms remaining in lockout, or 0 if not locked */
function checkRateLimit(ip: string): number {
  const now = Date.now()
  const entry = rateMap.get(ip)

  if (!entry) return 0

  // Still locked out
  if (entry.lockedUntil && now < entry.lockedUntil) {
    return entry.lockedUntil - now
  }

  // Lockout expired — reset
  if (entry.lockedUntil && now >= entry.lockedUntil) {
    rateMap.delete(ip)
    return 0
  }

  // Within the window but not locked
  if (now - entry.windowStart < WINDOW_MS) {
    if (entry.attempts >= MAX_ATTEMPTS) {
      // Just hit the limit — set lockout
      entry.lockedUntil = now + LOCKOUT_MS
      return LOCKOUT_MS
    }
  } else {
    // Window expired — reset
    rateMap.delete(ip)
  }

  return 0
}

function recordFailedAttempt(ip: string): void {
  const now = Date.now()
  const entry = rateMap.get(ip)

  if (!entry) {
    rateMap.set(ip, { attempts: 1, windowStart: now, lockedUntil: null })
    return
  }

  // Reset window if expired
  if (now - entry.windowStart >= WINDOW_MS) {
    rateMap.set(ip, { attempts: 1, windowStart: now, lockedUntil: null })
    return
  }

  entry.attempts += 1

  // Lock out if over the limit
  if (entry.attempts >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS
  }
}

function clearAttempts(ip: string): void {
  rateMap.delete(ip)
}

// ── Cookie options ────────────────────────────────────────────────────────────
const COOKIE_NAME = 'payroll_session'
const COOKIE_OPTS = {
  httpOnly: true,
  // secure: true requires HTTPS — set COOKIE_SECURE=true only when running behind HTTPS
  secure: process.env.COOKIE_SECURE === 'true',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 8, // 8 hours
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/** POST /api/auth — validate password, set session cookie */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req)

  // Check rate limit first
  const lockedMs = checkRateLimit(ip)
  if (lockedMs > 0) {
    const minutes = Math.ceil(lockedMs / 60_000)
    return NextResponse.json(
      { ok: false, error: `Too many attempts. Try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.` },
      { status: 429 }
    )
  }

  try {
    const { password } = await req.json() as { password?: string }

    if (!password) {
      return NextResponse.json({ ok: false, error: 'Password required' }, { status: 400 })
    }

    const expected = process.env.ACCESS_PASSWORD
    if (!expected) {
      return NextResponse.json(
        { ok: false, error: 'Server not configured — set ACCESS_PASSWORD env var' },
        { status: 500 }
      )
    }

    if (password !== expected) {
      recordFailedAttempt(ip)

      // How many attempts remaining after this one?
      const entry = rateMap.get(ip)
      const remaining = entry?.lockedUntil
        ? 0
        : Math.max(0, MAX_ATTEMPTS - (entry?.attempts ?? 0))

      const msg = remaining === 0
        ? `Too many attempts. Try again in 15 minutes.`
        : `Incorrect password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`

      return NextResponse.json({ ok: false, error: msg }, { status: 401 })
    }

    // Success — clear any failed attempts and set session cookie
    clearAttempts(ip)
    const token = await hashPassword(password)
    const res = NextResponse.json({ ok: true })
    res.cookies.set(COOKIE_NAME, token, COOKIE_OPTS)
    return res
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 })
  }
}

/** DELETE /api/auth — clear session cookie (logout) */
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, '', { ...COOKIE_OPTS, maxAge: 0 })
  return res
}
