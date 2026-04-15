import { NextRequest } from 'next/server'
import { getJob, jobEmitter } from '@/lib/job-store'

export const runtime = 'nodejs'

/**
 * GET /api/job-status/[jobId]
 *
 * Server-Sent Events stream. The client connects once and receives real-time
 * progress updates as the payroll job processes each employee.
 *
 * Events are JSON-stringified JobState objects pushed as:
 *   data: {...}\n\n
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params

  const existingJob = getJob(jobId)
  if (!existingJob) {
    return new Response(JSON.stringify({ error: 'Job not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      function send(data: unknown) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          // Client disconnected
        }
      }

      // ── Send current state immediately on connect ──────────────────────
      const current = getJob(jobId)
      if (current) send({ type: 'progress', state: current })

      // If job is already done, close immediately
      if (current?.status === 'done' || current?.status === 'error') {
        send({ type: 'done', state: current })
        controller.close()
        return
      }

      // ── Subscribe to live events ───────────────────────────────────────
      const listener = (event: unknown) => {
        send(event)
        // Close stream once job is done or errored
        const evt = event as { type: string }
        if (evt.type === 'done' || evt.type === 'error') {
          try { controller.close() } catch { /* already closed */ }
          jobEmitter.off(jobId, listener)
        }
      }

      jobEmitter.on(jobId, listener)

      // ── Heartbeat to keep connection alive (every 20s) ─────────────────
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          clearInterval(heartbeat)
        }
      }, 20_000)

      // ── Clean up on client disconnect ──────────────────────────────────
      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        jobEmitter.off(jobId, listener)
        try { controller.close() } catch { /* already closed */ }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable Nginx buffering
    },
  })
}
