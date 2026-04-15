import { NextRequest, NextResponse } from 'next/server'
import { verifySmtp } from '@/lib/email-sender'
import type { SmtpConfig } from '@/lib/email-sender'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as SmtpConfig
    const error = await verifySmtp(body)
    if (error) {
      return NextResponse.json({ ok: false, error }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
