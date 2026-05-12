import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { parseRosterCSV } from '@/lib/csv-parser'
import { extractAllPages, matchEmployeeToPage, loadPdf, extractSinglePageFromDoc } from '@/lib/pdf-processor'
import { createSmtpTransport, sendPayslipEmail } from '@/lib/email-sender'
import { createJob, addLogEntry, finalizeJob, updateJob } from '@/lib/job-store'
import type { Employee, LogEntry } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 300           // 5 min timeout
export const fetchCache = 'force-no-store'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()

    // ── 1. Read uploaded files ────────────────────────────────────────────
    const csvFile = formData.get('roster') as File | null
    const ledgerFile = formData.get('ledger') as File | null
    const payslipFile = formData.get('payslip') as File | null
    const idPatternRaw = formData.get('idPattern') as string | null
    // smtpConfig comes from env vars only — no UI override

    if (!csvFile) return NextResponse.json({ error: 'Missing roster CSV file.' }, { status: 400 })
    if (!ledgerFile) return NextResponse.json({ error: 'Missing ledger PDF file.' }, { status: 400 })
    if (!payslipFile) return NextResponse.json({ error: 'Missing payslip PDF file.' }, { status: 400 })

    // Default ID pattern — matches CLC ER Code format: ERCONEL02, ERFOFWA01, etc.
    // Updated to allow 1 digit endings (due to truncated payslips) and explicitly require ER prefix
    const idPattern =
      idPatternRaw?.trim() ||
      '(?:ER\\s*Code|Account\\s*Code|Employee\\s*(?:ID|Code|No\\.?)|Emp(?:loyee)?\\s*(?:ID|Code|No\\.?))[:\\s]*(ER[A-Z0-9]{4,})|\\b(ER[A-Z]{3,6}[0-9]{1,2})\\b'

    const isDryRun = formData.get('isDryRun') === 'true'

    // ── 2. Convert files to Buffers ────────────────────────────────────────
    const [csvAB, ledgerAB, payslipAB] = await Promise.all([
      csvFile.arrayBuffer(),
      ledgerFile.arrayBuffer(),
      payslipFile.arrayBuffer(),
    ])

    let csvText: string
    try {
      // Try strictly parsing as UTF-8
      const decoder = new TextDecoder('utf-8', { fatal: true })
      csvText = decoder.decode(csvAB)
    } catch (e) {
      // Fallback to windows-1252 (which covers typical Excel CSV exports with 'ñ')
      const decoder = new TextDecoder('windows-1252')
      csvText = decoder.decode(csvAB)
    }

    const ledgerBuf    = Buffer.from(ledgerAB)
    const payslipBuffer = Buffer.from(payslipAB)

    // ── 3. Parse roster CSV ────────────────────────────────────────────────
    const { map: rosterMap, errors: csvErrors } = parseRosterCSV(csvText)

    if (rosterMap.size === 0) {
      return NextResponse.json(
        { error: 'CSV produced no valid employee records.', details: csvErrors },
        { status: 400 }
      )
    }

    // ── 4. Create background job ───────────────────────────────────────────
    const jobId = uuidv4()
    createJob(jobId, rosterMap.size)
    updateJob(jobId, { status: 'processing' })

    // ── 5. Kick off processing asynchronously (do NOT await here) ──────────
    processPayroll({
      jobId,
      rosterMap,
      ledgerBuffer: ledgerBuf,
      payslipBuffer,
      idPattern,
      csvErrors,
      isDryRun,
    }).catch((err) => {
      console.error('[processPayroll] fatal error:', err)
      finalizeJob(jobId, err instanceof Error ? err.message : String(err))
    })

    return NextResponse.json({ jobId, total: rosterMap.size, csvWarnings: csvErrors })
  } catch (err) {
    console.error('[POST /api/process-payroll] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown server error' },
      { status: 500 }
    )
  }
}

// ── Background processing function ────────────────────────────────────────────

interface ProcessOptions {
  jobId: string
  rosterMap: Map<string, Employee>
  ledgerBuffer: Buffer
  payslipBuffer: Buffer
  idPattern: string
  csvErrors: string[]
  isDryRun: boolean
}

async function processPayroll(opts: ProcessOptions) {
  const { jobId, rosterMap, ledgerBuffer, payslipBuffer, idPattern, isDryRun } = opts

  // ── A. Scan both PDFs concurrently + pre-load doc objects ─────────────
  updateJob(jobId, { currentEmployee: 'Scanning PDFs…' })
  const [ledgerPages, payslipPages, ledgerDoc, payslipDoc] = await Promise.all([
    extractAllPages(ledgerBuffer, idPattern),
    extractAllPages(payslipBuffer, idPattern),
    loadPdf(ledgerBuffer),   // pre-load ONCE — reused for all 300 employees
    loadPdf(payslipBuffer),  // pre-load ONCE — reused for all 300 employees
  ])

  // ── B. Create ONE shared SMTP transporter for the entire batch ─────────
  // IMPORTANT: never call createSmtpTransport() inside the employee loop.
  // Opening 300 separate TCP connections will cause Gmail to throttle/reject.
  const { transporter, from } = createSmtpTransport()
  updateJob(jobId, { currentEmployee: 'Dispatching emails…' })

  // ── B. For each employee: fuzzy-match → extract pages → email ─────────
  for (const [empId, employee] of rosterMap) {
    updateJob(jobId, { currentEmployee: `${employee.name || empId} (${empId})` })

    // 3-tier fuzzy match on each PDF independently
    const ledgerMatch  = matchEmployeeToPage(employee, ledgerPages)
    const payslipMatch = matchEmployeeToPage(employee, payslipPages)

    const entry: LogEntry = {
      employeeId:   empId,
      name:         employee.name,
      email:        employee.email,
      status:       'success',
      ledgerPage:   ledgerMatch  != null ? ledgerMatch.pageIndex  + 1 : null,
      payslipPage:  payslipMatch != null ? payslipMatch.pageIndex + 1 : null,
      ledgerMatch:  ledgerMatch?.matchType  ?? null,
      payslipMatch: payslipMatch?.matchType ?? null,
      timestamp:    new Date().toISOString(),
    }

    // Neither PDF matched → no-match
    if (!ledgerMatch && !payslipMatch) {
      entry.status = 'no-match'
      entry.error  = `ER Code "${empId}" not found in either PDF (tried exact, fuzzy ±2 chars, name fallback).`
      addLogEntry(jobId, entry)
      continue
    }

    try {
      // Handle warnings from name verification (collisions) before attempting any dispatch
      if (ledgerMatch?.warning || payslipMatch?.warning) {
        entry.status = 'failed'
        entry.error = [ledgerMatch?.warning, payslipMatch?.warning].filter(Boolean).join(' | ')
      } else {
        if (!isDryRun) {
          // Extract individual pages using pre-loaded doc objects (no re-parse per employee)
          const [ledgerPdf, payslipPdf] = await Promise.all([
            ledgerMatch  ? extractSinglePageFromDoc(ledgerDoc,  ledgerMatch.pageIndex)  : Promise.resolve(null),
            payslipMatch ? extractSinglePageFromDoc(payslipDoc, payslipMatch.pageIndex) : Promise.resolve(null),
          ])

          await sendPayslipEmail({ employee, ledgerPdf, payslipPdf, transporter, from })
        }
        entry.status = 'success'

        // Warn if only one PDF was matched (still sends what we have)
        if (!ledgerMatch || !payslipMatch) {
          entry.error = !ledgerMatch
            ? 'Ledger page not found — only payslip attached.'
            : 'Payslip page not found — only ledger attached.'
            
          if (isDryRun) entry.error += ' (Dry Run)'
        } else if (isDryRun) {
          entry.error = 'Matched successfully (Dry Run)'
        }
      }
    } catch (err) {
      entry.status = 'failed'
      entry.error  = err instanceof Error ? err.message : String(err)
    }

    addLogEntry(jobId, entry)

    // Yield to avoid blocking the event loop on large batches
    await new Promise((r) => setTimeout(r, 0))
  }

  // Close the SMTP connection pool cleanly
  transporter.close()

  finalizeJob(jobId)
}
