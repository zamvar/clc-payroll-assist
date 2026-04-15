import { EventEmitter } from 'events'
import type { JobState, LogEntry } from './types'

// Module-level job store — survives across requests in the same Next.js process.
// For production scale, replace with Redis + BullMQ.
const jobs = new Map<string, JobState>()
export const jobEmitter = new EventEmitter()
jobEmitter.setMaxListeners(200) // one listener per SSE client

export function createJob(jobId: string, total: number): JobState {
  const state: JobState = {
    jobId,
    status: 'pending',
    total,
    processed: 0,
    succeeded: 0,
    failed: 0,
    noMatch: 0,
    log: [],
    startedAt: new Date().toISOString(),
  }
  jobs.set(jobId, state)
  return state
}

export function getJob(jobId: string): JobState | undefined {
  return jobs.get(jobId)
}

export function updateJob(jobId: string, patch: Partial<JobState>): void {
  const job = jobs.get(jobId)
  if (!job) return
  const updated = { ...job, ...patch }
  jobs.set(jobId, updated)
  jobEmitter.emit(jobId, { type: 'progress', state: updated })
}

export function addLogEntry(jobId: string, entry: LogEntry): void {
  const job = jobs.get(jobId)
  if (!job) return

  job.log.push(entry)
  job.processed += 1

  if (entry.status === 'success') job.succeeded += 1
  else if (entry.status === 'failed') job.failed += 1
  else job.noMatch += 1

  jobs.set(jobId, job)
  jobEmitter.emit(jobId, { type: 'progress', state: { ...job } })
}

export function finalizeJob(jobId: string, errorMessage?: string): void {
  const job = jobs.get(jobId)
  if (!job) return
  const updated: JobState = {
    ...job,
    status: errorMessage ? 'error' : 'done',
    finishedAt: new Date().toISOString(),
    ...(errorMessage ? { errorMessage } : {}),
  }
  jobs.set(jobId, updated)
  jobEmitter.emit(jobId, { type: 'done', state: updated })
}
