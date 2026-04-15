import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/login', '/api/auth', '/api/health']

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

/** SHA-256 of password + secret pepper — consistent across Edge and Node.js */
async function hashPassword(password: string): Promise<string> {
  const secret = process.env.COOKIE_SECRET || 'dev-secret-change-in-prod'
  const enc = new TextEncoder()
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(password + ':' + secret))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (isPublic(pathname)) return NextResponse.next()

  const session = req.cookies.get('payroll_session')?.value
  if (!session) {
    const url = new URL('/login', req.url)
    url.searchParams.set('from', pathname)
    return NextResponse.redirect(url)
  }

  const expected = await hashPassword(process.env.ACCESS_PASSWORD || '')
  if (!safeEqual(session, expected)) {
    const url = new URL('/login', req.url)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
