// Shared types across the payroll system

export interface Employee {
  id: string
  name: string       // assembled full name
  firstName?: string // for name-fallback matching
  lastName?: string  // for name-fallback matching
  email: string
}

export type LogStatus = 'success' | 'failed' | 'no-match'

export interface LogEntry {
  employeeId: string
  name: string
  email: string
  status: LogStatus
  ledgerPage: number | null    // 1-based page number found in ledger PDF
  payslipPage: number | null   // 1-based page number found in payslip PDF
  ledgerMatch: MatchType | null
  payslipMatch: MatchType | null
  error?: string
  timestamp: string
}

export type MatchType = 'exact' | 'fuzzy-1' | 'fuzzy-2' | 'name'

export interface JobState {
  jobId: string
  status: 'pending' | 'processing' | 'done' | 'error'
  total: number
  processed: number
  succeeded: number
  failed: number
  noMatch: number
  currentEmployee?: string
  log: LogEntry[]
  errorMessage?: string
  startedAt: string
  finishedAt?: string
}

export type SseEvent =
  | { type: 'progress'; state: JobState }
  | { type: 'done'; state: JobState }
  | { type: 'error'; message: string }
