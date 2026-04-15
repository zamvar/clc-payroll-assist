'use client'

import { useRef, useState, useEffect, DragEvent, ChangeEvent } from 'react'
import type { JobState, LogEntry, MatchType } from '@/lib/types'

// ─── Types ─────────────────────────────────────────────────────────────────



interface UploadedFile {
  file: File
  name: string
  sizeKb: number
}

// ─── Icons (inline SVG, no dep) ────────────────────────────────────────────

const IconFile = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
)

const IconCSV = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75.125V6.375A1.125 1.125 0 013.375 5.25h17.25c.621 0 1.125.504 1.125 1.125v12m-3.75.125c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125-.504-1.125-1.125M6 18.375V7.5A1.125 1.125 0 017.125 6.375h9.75c.621 0 1.125.504 1.125 1.125v10.875m-12 0h12M9 12h.008v.008H9V12zm3 0h.008v.008H12V12zm3 0h.008v.008H15V12z" />
  </svg>
)

const IconEmail = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
  </svg>
)

const IconSpinner = ({ className }: { className?: string }) => (
  <svg className={`spin ${className ?? ''}`} fill="none" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity=".25" />
    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" opacity=".75" />
  </svg>
)

const IconCheck = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
)

const IconX = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const IconChevron = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} width={16} height={16}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
)

const IconWarning = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} width={16} height={16}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
  </svg>
)

// ─── Drop Zone Component ────────────────────────────────────────────────────

interface DropZoneProps {
  id: string
  title: string
  accept: string
  hint: string
  file: UploadedFile | null
  onFile: (file: File) => void
  icon?: 'csv' | 'pdf'
  disabled?: boolean
}

function DropZone({ id, title, accept, hint, file, onFile, icon = 'pdf', disabled }: DropZoneProps) {
  const [dragging, setDragging] = useState(false)

  function handleDragOver(e: DragEvent) {
    e.preventDefault()
    if (!disabled) setDragging(true)
  }

  function handleDragLeave() { setDragging(false) }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    const dropped = e.dataTransfer.files[0]
    if (dropped) onFile(dropped)
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) onFile(f)
    e.target.value = '' // allow re-upload of same file
  }

  const Icon = icon === 'csv' ? IconCSV : IconFile

  return (
    <label
      htmlFor={id}
      className={`drop-zone ${dragging ? 'drag-over' : ''} ${file ? 'has-file' : ''} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        id={id}
        type="file"
        accept={accept}
        onChange={handleChange}
        disabled={disabled}
      />
      <Icon className="drop-zone-icon" />
      <div className="drop-zone-text">
        <div className="drop-zone-title">{title}</div>
        {file ? (
          <div className="drop-zone-filename">
            ✓ {file.name} ({file.sizeKb} KB)
          </div>
        ) : (
          <div className="drop-zone-sub">{hint}</div>
        )}
      </div>
    </label>
  )
}

// ─── Status Badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: LogEntry['status'] }) {
  if (status === 'success') return <span className="badge badge-success"><IconCheck className="w-3 h-3" /> Sent</span>
  if (status === 'failed')  return <span className="badge badge-failed"><IconX className="w-3 h-3" /> Failed</span>
  return <span className="badge badge-no-match"><IconWarning className="w-3 h-3" /> No Match</span>
}

// ─── Match Type Badge ────────────────────────────────────────────────────────

const MATCH_LABEL: Record<MatchType, string> = {
  'exact':   '✓ exact',
  'fuzzy-1': '~1 char',
  'fuzzy-2': '~2 chars',
  'name':    'by name',
}

const MATCH_COLOR: Record<MatchType, string> = {
  'exact':   'oklch(50% 0.14 152)',   // green
  'fuzzy-1': 'oklch(60% 0.17 55)',   // amber
  'fuzzy-2': 'oklch(55% 0.18 40)',   // orange
  'name':    'oklch(50% 0.17 290)',  // violet
}

const MATCH_BG: Record<MatchType, string> = {
  'exact':   'oklch(96% 0.04 152)',
  'fuzzy-1': 'oklch(96% 0.06 80)',
  'fuzzy-2': 'oklch(96% 0.07 65)',
  'name':    'oklch(96% 0.04 290)',
}

function MatchBadge({ type }: { type: MatchType | null }) {
  if (!type || type === 'exact') return null
  return (
    <span style={{
      display: 'inline-block',
      fontSize: '0.58rem',
      fontFamily: 'var(--font-dm-mono)',
      fontWeight: 500,
      letterSpacing: '0.05em',
      padding: '0.1rem 0.35rem',
      borderRadius: '2px',
      marginLeft: '0.35rem',
      background: MATCH_BG[type],
      color: MATCH_COLOR[type],
      verticalAlign: 'middle',
    }}>
      {MATCH_LABEL[type]}
    </span>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

// Matches bare ER codes (e.g. ERCONEL02) or labeled (e.g. "ER Code: ERCONEL02")
const DEFAULT_ID_PATTERN =
  '(?:ER\\s*Code|Employee\\s*(?:ID|Code|No\\.?)|Emp(?:loyee)?\\s*(?:ID|Code|No\\.?))[:\\s]*([A-Z]{2,3}[A-Z0-9]{3,})|\\b(ER[A-Z]{3,6}[0-9]{2})\\b'

export default function Home() {
  // ── File state ────────────────────────────────────────────────────────────
  const [csvFile, setCsvFile]     = useState<UploadedFile | null>(null)
  const [ledgerFile, setLedgerFile]   = useState<UploadedFile | null>(null)
  const [payslipFile, setPayslipFile] = useState<UploadedFile | null>(null)

  // ── Settings state ────────────────────────────────────────────────────────
  const idPattern = DEFAULT_ID_PATTERN

  // ── Job state ─────────────────────────────────────────────────────────────
  const [jobId, setJobId]     = useState<string | null>(null)
  const [job, setJob]         = useState<JobState | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [globalError, setGlobalError] = useState('')
  const [csvWarnings, setCsvWarnings] = useState<string[]>([])
  const eventSourceRef = useRef<EventSource | null>(null)

  const isProcessing = job?.status === 'processing' || job?.status === 'pending'
  const isDone       = job?.status === 'done'
  const isError      = job?.status === 'error'

  // ── File helpers ──────────────────────────────────────────────────────────
  function toUploadedFile(f: File): UploadedFile {
    return { file: f, name: f.name, sizeKb: Math.round(f.size / 1024) }
  }

  // ── SSE subscription ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!jobId) return

    const es = new EventSource(`/api/job-status/${jobId}`)
    eventSourceRef.current = es

    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data) as { type: string; state?: JobState; message?: string }
        if (payload.state) setJob({ ...payload.state })
        if (payload.type === 'done' || payload.type === 'error') {
          es.close()
          setSubmitting(false)
        }
      } catch { /* ignore malformed */ }
    }

    es.onerror = () => {
      es.close()
      setSubmitting(false)
    }

    return () => { es.close() }
  }, [jobId])

  // ── SMTP verify ───────────────────────────────────────────────────────────


  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!csvFile || !ledgerFile || !payslipFile) return
    setGlobalError('')
    setCsvWarnings([])
    setSubmitting(true)
    setJob(null)
    setJobId(null)

    const form = new FormData()
    form.append('roster',  csvFile.file)
    form.append('ledger',  ledgerFile.file)
    form.append('payslip', payslipFile.file)
    form.append('idPattern', idPattern)

    // SMTP config is read from .env.local on the server — no UI override needed

    try {
      const res = await fetch('/api/process-payroll', { method: 'POST', body: form })
      const data = await res.json() as { jobId?: string; total?: number; csvWarnings?: string[]; error?: string; details?: string[] }

      if (!res.ok || !data.jobId) {
        setGlobalError(data.error ?? 'Failed to start job.')
        if (data.details) setCsvWarnings(data.details)
        setSubmitting(false)
        return
      }

      if (data.csvWarnings?.length) setCsvWarnings(data.csvWarnings)
      setJobId(data.jobId)
      // SSE useEffect will pick up from here
    } catch (e) {
      setGlobalError('Network error — could not reach server.')
      setSubmitting(false)
    }
  }

  // ── Progress calculation ──────────────────────────────────────────────────
  const pct = job && job.total > 0
    ? Math.round((job.processed / job.total) * 100)
    : 0

  const canSubmit = !!csvFile && !!ledgerFile && !!payslipFile && !isProcessing && !submitting

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main>
      <div className="page-shell">

        {/* Header */}
        <header className="site-header">
          <div className="site-logo">
            <span className="site-logo-eyebrow">CLC Payroll System</span>
            <h1 className="site-logo-title">
              Payroll <span>Dispatch</span>
            </h1>
          </div>
          <div className="site-header-meta">
            <div>PDF Reconciliation</div>
            <div>& Email Dispatch</div>
            {isProcessing && (
              <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--green)', fontSize: '0.65rem' }}>
                <span className="live-dot" /> Processing…
              </div>
            )}
            {isDone && (
              <div style={{ marginTop: '0.5rem', color: 'var(--green)', fontSize: '0.65rem' }}>
                ✓ Complete
              </div>
            )}
            <button
              onClick={async () => {
                await fetch('/api/auth', { method: 'DELETE' })
                window.location.href = '/login'
              }}
              style={{
                marginTop: '0.75rem',
                fontFamily: 'var(--font-dm-mono)',
                fontSize: '0.6rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--ink-faint)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Main workspace */}
        <div className="workspace">

          {/* ─ Left column: Uploads + Settings ─ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>

            {/* Upload section */}
            <section>
              <p className="section-label">Upload Files</p>
              <div className="upload-grid">
                <DropZone
                  id="csv-upload"
                  title="Employee Roster CSV"
                  accept=".csv,text/csv"
                  hint="Drag & drop or click — Name, Employee ID, Email columns required"
                  file={csvFile}
                  onFile={(f) => setCsvFile(toUploadedFile(f))}
                  icon="csv"
                  disabled={isProcessing}
                />
                <DropZone
                  id="ledger-upload"
                  title="Ledger PDF"
                  accept=".pdf,application/pdf"
                  hint="Bulk ledger — one employee per page"
                  file={ledgerFile}
                  onFile={(f) => setLedgerFile(toUploadedFile(f))}
                  icon="pdf"
                  disabled={isProcessing}
                />
                <DropZone
                  id="payslip-upload"
                  title="Payslip PDF"
                  accept=".pdf,application/pdf"
                  hint="Bulk payslips — one payslip per page"
                  file={payslipFile}
                  onFile={(f) => setPayslipFile(toUploadedFile(f))}
                  icon="pdf"
                  disabled={isProcessing}
                />
              </div>
            </section>



            {/* Warnings */}
            {csvWarnings.length > 0 && (
              <div className="alert alert-warning">
                <IconWarning />
                <div>
                  <strong>CSV Warnings ({csvWarnings.length})</strong>
                  <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1rem', listStyleType: 'disc' }}>
                    {csvWarnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
                    {csvWarnings.length > 5 && <li>…and {csvWarnings.length - 5} more</li>}
                  </ul>
                </div>
              </div>
            )}

            {/* Global error */}
            {globalError && (
              <div className="alert alert-error">
                <IconX className="w-4 h-4 flex-shrink-0" />
                <span>{globalError}</span>
              </div>
            )}
          </div>

          {/* ─ Right sidebar: File summary + Action ─ */}
          <aside className="sidebar-panel">

            {/* Sender indicator — always visible, shows .env.local is configured */}
            <div style={{
              fontFamily: 'var(--font-dm-mono)',
              fontSize: '0.65rem',
              color: 'var(--ink-faint)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}>
              <IconEmail className="w-3 h-3" />
              Sending via <span style={{ color: 'var(--ink)', fontWeight: 500 }}>
                {process.env.NEXT_PUBLIC_SMTP_FROM_DISPLAY || 'clcpayroll@adventist.ph'}
              </span>
            </div>

            {/* File summary — appears as files are loaded */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
              {[
                { label: 'Roster', f: csvFile },
                { label: 'Ledger PDF', f: ledgerFile },
                { label: 'Payslip PDF', f: payslipFile },
              ].map(({ label, f }) => (
                <div key={label} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  fontSize: '0.78rem',
                }}>
                  <span style={{ color: 'var(--ink-faint)', fontFamily: 'var(--font-dm-mono)', fontSize: '0.65rem', paddingTop: '0.15rem', flexShrink: 0 }}>{label}</span>
                  <span style={{
                    color: f ? 'var(--ink)' : 'var(--paper-rule)',
                    fontFamily: 'var(--font-dm-mono)',
                    fontSize: '0.7rem',
                    fontWeight: f ? 500 : 400,
                    textAlign: 'right',
                    wordBreak: 'break-all',
                  }}>
                    {f ? f.name : '—'}
                  </span>
                </div>
              ))}
            </div>

            {/* Action button — pushed to bottom with strong rule */}
            <div style={{ borderTop: '2px solid var(--ink)', paddingTop: '1.25rem' }}>
              <button
                id="dispatch-btn"
                className="btn-primary"
                onClick={handleSubmit}
                disabled={!canSubmit}
                type="button"
              >
                {submitting || isProcessing ? (
                  <><IconSpinner className="w-4 h-4" /> Processing…</>
                ) : isDone ? (
                  <><IconCheck className="w-4 h-4" /> Run Again</>
                ) : (
                  <><IconEmail className="w-4 h-4" /> Dispatch Payslips</>
                )}
              </button>

              {isDone && job && (
                <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: '0.65rem', color: 'var(--ink-faint)', textAlign: 'center', marginTop: '0.6rem' }}>
                  Done in {
                    job.finishedAt && job.startedAt
                      ? `${((new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()) / 1000).toFixed(1)}s`
                      : '—'
                  } · {job.succeeded} sent
                </p>
              )}
            </div>
          </aside>

          {/* ─ Progress section (full width) ─ */}
          {job && (
            <section className="progress-section">
              <div className="progress-header">
                <span className="progress-title">
                  {isProcessing ? 'Processing…' : isDone ? 'Complete' : isError ? 'Error' : 'Job Status'}
                </span>
                <span className="progress-pct">{pct}%</span>
              </div>

              <div className="progress-track">
                <div
                  className={`progress-fill ${isDone ? 'done' : isError ? 'error' : ''}`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div className="progress-current">
                {isProcessing && job.currentEmployee
                  ? `→ ${job.currentEmployee}`
                  : isDone
                    ? `All ${job.total} employees processed.`
                    : isError
                      ? `Error: ${job.errorMessage}`
                      : ''}
              </div>

              {isError && (
                <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>
                  <IconX className="w-4 h-4" />
                  {job.errorMessage}
                </div>
              )}

              {/* Inline stats strip */}
              <div style={{
                display: 'flex',
                gap: '1.5rem',
                marginTop: '1rem',
                fontFamily: 'var(--font-dm-mono)',
                fontSize: '0.72rem',
              }}>
                <span style={{ color: 'var(--ink-mid)' }}>
                  <strong style={{ color: 'var(--ink)', fontSize: '1.1rem' }}>{job.total}</strong> total
                </span>
                <span style={{ color: 'var(--green)' }}>
                  <strong style={{ fontSize: '1.1rem' }}>{job.succeeded}</strong> sent
                </span>
                {job.failed > 0 && (
                  <span style={{ color: 'var(--red)' }}>
                    <strong style={{ fontSize: '1.1rem' }}>{job.failed}</strong> failed
                  </span>
                )}
                {job.noMatch > 0 && (
                  <span style={{ color: 'var(--amber-deep)' }}>
                    <strong style={{ fontSize: '1.1rem' }}>{job.noMatch}</strong> no match
                  </span>
                )}
              </div>
            </section>
          )}

          {/* ─ Log table (full width) ─ */}
          {job && job.log.length > 0 && (
            <section className="log-section">
              <div className="section-title">
                Dispatch Log — {job.log.length} record{job.log.length !== 1 ? 's' : ''}
                {isProcessing && <span className="live-dot" style={{ marginLeft: '0.5rem' }} />}
              </div>
              <div className="log-table-wrap">
                <table className="log-table">
                  <thead>
                    <tr>
                      <th>ER Code</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Ledger Pg</th>
                      <th>Payslip Pg</th>
                      <th>Status</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.log.map((entry, i) => (
                      <tr
                        key={`${entry.employeeId}-${i}`}
                        className={
                          entry.status === 'success'  ? 'row-success'  :
                          entry.status === 'failed'   ? 'row-failed'   :
                          'row-no-match'
                        }
                      >
                        <td className="td-id">{entry.employeeId}</td>
                        <td>{entry.name || '—'}</td>
                        <td>{entry.email}</td>
                        <td className="td-page">
                          {entry.ledgerPage ?? '—'}
                          <MatchBadge type={entry.ledgerMatch} />
                        </td>
                        <td className="td-page">
                          {entry.payslipPage ?? '—'}
                          <MatchBadge type={entry.payslipMatch} />
                        </td>
                        <td><StatusBadge status={entry.status} /></td>
                        <td style={{ color: 'var(--ink-faint)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entry.error ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Empty state — no job yet */}
          {!job && !submitting && (
            <div className="log-section">
              <div className="empty-instructions">
                <p className="empty-instructions-heading">How it works</p>
                <ol className="empty-instructions-list">
                  <li>
                    <span className="empty-step-num">1</span>
                    <span>Upload your <strong>Employee Roster CSV</strong> with ER Codes and email addresses</span>
                  </li>
                  <li>
                    <span className="empty-step-num">2</span>
                    <span>Upload the bulk <strong>Ledger PDF</strong> and <strong>Payslip PDF</strong> — one page per employee</span>
                  </li>
                  <li>
                    <span className="empty-step-num">3</span>
                    <span>Click <strong>Dispatch Payslips</strong> — each employee receives their own page by email</span>
                  </li>
                </ol>
                <p className="empty-instructions-note">
                  ER Codes are matched automatically. If the PDF code is truncated (missing 1–2 chars), the system falls back to name matching.
                </p>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <footer className="site-footer">
          <span>CLC Payroll Dispatch v0.1</span>
          <span>
            {job && isDone
              ? `Last run: ${new Date(job.finishedAt!).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}`
              : 'No run yet'}
          </span>
        </footer>

      </div>
    </main>
  )
}
