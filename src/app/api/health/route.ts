import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * GET /api/health
 * Lightweight health check used by Render to confirm the app is running.
 * Returns 200 if the server is up, 503 if something is misconfigured.
 */
export function GET() {
  const smtpConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASS)
  const authConfigured = !!(process.env.ACCESS_PASSWORD && process.env.COOKIE_SECRET)

  if (!smtpConfigured || !authConfigured) {
    return NextResponse.json(
      {
        ok: false,
        missing: [
          ...(!smtpConfigured ? ['SMTP_USER', 'SMTP_PASS'] : []),
          ...(!authConfigured ? ['ACCESS_PASSWORD', 'COOKIE_SECRET'] : []),
        ],
      },
      { status: 503 }
    )
  }

  return NextResponse.json({ ok: true, uptime: process.uptime() })
}
