import { createTransport, type Transporter } from 'nodemailer'
import type { Employee } from './types'

// Transporter<any> accepts both pool and non-pool variants from @types/nodemailer
type SmtpTransporter = Transporter<any>

// Local attachment shape compatible with nodemailer's expected format
interface Attachment {
  filename: string
  content: Buffer
  contentType: string
}

export interface SendPayslipOptions {
  employee: Employee
  ledgerPdf: Buffer | null
  payslipPdf: Buffer | null
  transporter: SmtpTransporter  // injected from outside — reused across all 300 sends
  from: string
}

export interface SmtpConfig {
  host: string
  port: number
  user: string
  pass: string
  from: string
}

/**
 * Create a single SMTP transporter to be reused for the entire batch.
 * Call once before the loop — do NOT create inside the loop.
 */
export function createSmtpTransport(config?: SmtpConfig): {
  transporter: SmtpTransporter
  from: string
} {
  const host = config?.host || process.env.SMTP_HOST || 'smtp.gmail.com'
  const port = config?.port || parseInt(process.env.SMTP_PORT ?? '587', 10)
  const user = config?.user || process.env.SMTP_USER || ''
  const pass = config?.pass || process.env.SMTP_PASS || ''
  const from = config?.from || process.env.SMTP_FROM || user

  const transporter = createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    // Connection pool — reuse connections instead of opening a new one per email
    pool: true,
    maxConnections: 3,    // keep 3 connections open (safe for Gmail Workspace)
    maxMessages: 100,     // recycle connection after 100 messages (prevents stale sockets)
    rateDelta: 1000,      // rate window in ms
    rateLimit: 5,         // max 5 emails per second (300/min — well within Gmail limits)
  })

  return { transporter, from }
}

/**
 * Send one employee's email with their payslip and/or ledger page attached.
 * Reuses the transporter passed in from the batch job.
 */
export async function sendPayslipEmail(opts: SendPayslipOptions): Promise<void> {
  const { employee, ledgerPdf, payslipPdf, transporter, from } = opts

  const attachments: Attachment[] = []

  if (ledgerPdf) {
    attachments.push({
      filename: `Ledger_${employee.id}.pdf`,
      content: ledgerPdf,
      contentType: 'application/pdf',
    })
  }

  if (payslipPdf) {
    attachments.push({
      filename: `Payslip_${employee.id}.pdf`,
      content: payslipPdf,
      contentType: 'application/pdf',
    })
  }

  const docList =
    attachments.length === 2
      ? 'payslip and ledger record'
      : attachments.length === 1
        ? attachments[0].filename?.includes('Ledger') ? 'ledger record' : 'payslip'
        : 'document'

  await transporter.sendMail({
    from,
    to: employee.email,
    subject: `Your Payslip — ${employee.name || employee.id}`,
    html: `
      <meta charset="utf-8">
      <div style="font-family: Arial, sans-serif; color: #1a1a2e; max-width: 600px;">
        <h2 style="color: #1a1a2e; border-bottom: 2px solid #e8a838; padding-bottom: 8px;">
          Payroll Dispatch
        </h2>
        <p>Dear ${employee.name || 'Employee'},</p>
        <p>
          Please find your attached ${docList} for the current payroll period.
          If you have any questions, please contact HR.
        </p>
        <p style="font-size: 12px; color: #888; margin-top: 24px;">
          Employee ID: <strong>${employee.id}</strong>
        </p>
        <p style="font-size: 11px; color: #aaa;">
          This is an automated message from the Payroll System. Do not reply to this email.
        </p>
      </div>
    `,
    attachments,
  })
}

/**
 * Verify SMTP configuration is reachable.
 * Returns null on success, error message on failure.
 */
export async function verifySmtp(config?: SmtpConfig): Promise<string | null> {
  const { transporter } = createSmtpTransport(config)
  try {
    await transporter.verify()
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}
