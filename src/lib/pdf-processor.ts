import { PDFDocument } from 'pdf-lib'
import type { Employee } from './types'

// pdf-parse must be required (not imported) to avoid ESM issues in Next.js server context
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse')

// ─── Data shape ──────────────────────────────────────────────────────────────

/**
 * Represents the parsed content of a single PDF page.
 * Both rawId (the ER Code extracted by regex) and full text
 * are stored so name-fallback matching can work without re-scanning.
 */
export interface PageData {
  pageIndex: number   // 0-based
  rawId: string | null // ER Code found on this page (may be truncated due to export bug)
  text: string        // full plain text of the page — used for name fallback
}

// ─── Text extraction ─────────────────────────────────────────────────────────

/**
 * Extract per-page text from a PDF buffer using pdf-parse's pagerender hook.
 * Returns an array where index N = page N+1's text.
 */
async function extractPagesText(pdfBuffer: Buffer): Promise<string[]> {
  const pageTexts: string[] = []

  function renderPage(pageData: {
    getTextContent: (opts?: object) => Promise<{
      items: Array<{ str: string; transform: number[] }>
    }>
  }) {
    return pageData
      .getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false })
      .then((content) => {
        const lines: string[] = []
        let lastY: number | undefined
        for (const item of content.items) {
          const y = item.transform[5]
          if (lastY === undefined || Math.abs(y - lastY) > 2) {
            if (lines.length > 0) lines.push(' ')
          }
          lines.push(item.str)
          lastY = y
        }
        const text = lines.join('')
        pageTexts.push(text)
        return text
      })
  }

  await pdfParse(pdfBuffer, { pagerender: renderPage })
  return pageTexts
}

// ─── Public: extract all pages with their IDs ────────────────────────────────

/**
 * Scan all pages of a PDF, extracting the ER Code (if found) and the full text.
 * Returns one PageData entry per page.
 *
 * @param pdfBuffer  Raw PDF bytes
 * @param idPattern  Regex with at least one capture group for the ID value
 */
export async function extractAllPages(
  pdfBuffer: Buffer,
  idPattern: string
): Promise<PageData[]> {
  const regex = new RegExp(idPattern, 'i')
  const texts = await extractPagesText(pdfBuffer)

  return texts.map((text, pageIndex) => {
    const match = text.match(regex)
    let rawId: string | null = null

    if (match) {
      // Use first non-empty capture group
      rawId = match.slice(1).find((g) => g && g.trim())?.trim() ?? null
    }

    return { pageIndex, rawId, text }
  })
}

// ─── Fuzzy matching ───────────────────────────────────────────────────────────

/**
 * Compute how many trailing characters of `full` are missing from `partial`.
 * Returns the number of missing chars if `partial` is a prefix of `full`
 * (meaning the PDF exported a truncated ER Code), or -1 if not a prefix.
 *
 * e.g. full="ERCONEL02", partial="ERCONEL0" → 1
 *      full="ERCONEL02", partial="ERCONEL"  → 2
 *      full="ERCONEL02", partial="ERFOFWA01" → -1 (not a prefix)
 */
function trailingCharsMissing(full: string, partial: string): number {
  if (!partial || partial.length >= full.length) return -1
  if (full.startsWith(partial)) return full.length - partial.length
  return -1
}

/**
 * Name-based fallback: score each candidate page by how many words from
 * the employee's first/last name appear in the page text.
 *
 * Returns the pageIndex of the best-scoring candidate, or null if none match.
 */
function nameFallback(employee: Employee, candidates: PageData[]): number | null {
  const firstName = employee.firstName?.toLowerCase().trim() ?? ''
  const lastName  = employee.lastName?.toLowerCase().trim()  ?? ''

  if (!firstName && !lastName) return null

  const scored = candidates
    .map((p) => {
      const text = p.text.toLowerCase()
      let score = 0
      if (firstName && text.includes(firstName)) score += 2
      if (lastName  && text.includes(lastName))  score += 2
      // Bonus: both present
      if (firstName && lastName && text.includes(firstName) && text.includes(lastName)) score += 1
      return { pageIndex: p.pageIndex, score }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return null

  // Unambiguous if the top scorer has a higher score than the runner-up
  if (scored.length === 1 || scored[0].score > scored[1].score) {
    return scored[0].pageIndex
  }

  // Still tied — return first (best guess)
  return scored[0].pageIndex
}

/**
 * Find the best-matching page for an employee using a 3-tier strategy:
 *
 * Tier 1 — Exact match:       rawId === employee.id
 * Tier 2 — Fuzzy prefix:      rawId is a prefix of employee.id, ≤ 2 chars short
 * Tier 3 — Name fallback:     search page text for firstName + lastName
 *           (used when tier 1/2 yields multiple candidates)
 *
 * Returns 0-based pageIndex, or null if no match found.
 */
export function matchEmployeeToPage(
  employee: Employee,
  pages: PageData[]
): { pageIndex: number; matchType: 'exact' | 'fuzzy-1' | 'fuzzy-2' | 'name' } | null {
  // ── Tier 1: Exact match ────────────────────────────────────────────────
  const exactMatches = pages.filter((p) => p.rawId === employee.id)

  if (exactMatches.length === 1) {
    return { pageIndex: exactMatches[0].pageIndex, matchType: 'exact' }
  }
  if (exactMatches.length > 1) {
    // Multiple pages with the same ID — use name fallback to disambiguate
    const idx = nameFallback(employee, exactMatches)
    return idx != null ? { pageIndex: idx, matchType: 'name' } : null
  }

  // ── Tier 2a: Fuzzy — 1 trailing char missing ───────────────────────────
  const fuzzy1 = pages.filter(
    (p) => p.rawId != null && trailingCharsMissing(employee.id, p.rawId) === 1
  )

  if (fuzzy1.length === 1) {
    return { pageIndex: fuzzy1[0].pageIndex, matchType: 'fuzzy-1' }
  }
  if (fuzzy1.length > 1) {
    const idx = nameFallback(employee, fuzzy1)
    return idx != null ? { pageIndex: idx, matchType: 'name' } : null
  }

  // ── Tier 2b: Fuzzy — 2 trailing chars missing ──────────────────────────
  const fuzzy2 = pages.filter(
    (p) => p.rawId != null && trailingCharsMissing(employee.id, p.rawId) === 2
  )

  if (fuzzy2.length === 1) {
    return { pageIndex: fuzzy2[0].pageIndex, matchType: 'fuzzy-2' }
  }
  if (fuzzy2.length > 1) {
    const idx = nameFallback(employee, fuzzy2)
    return idx != null ? { pageIndex: idx, matchType: 'name' } : null
  }

  // ── Tier 3: Pure name fallback (no ID match at all) ────────────────────
  // Only try if we have name data — avoids false positives on nameless rows
  if (employee.firstName || employee.lastName) {
    const idx = nameFallback(employee, pages)
    return idx != null ? { pageIndex: idx, matchType: 'name' } : null
  }

  return null
}

// ─── Page extraction ─────────────────────────────────────────────────────────

/**
 * Extract a single page from a PDF buffer and return it as a new single-page PDF Buffer.
 *
 * @param pdfBuffer  Source PDF bytes
 * @param pageIndex  0-based page index
 */
export async function extractSinglePage(
  pdfBuffer: Buffer,
  pageIndex: number
): Promise<Buffer> {
  const srcDoc = await PDFDocument.load(pdfBuffer)
  const newDoc = await PDFDocument.create()

  const [copiedPage] = await newDoc.copyPages(srcDoc, [pageIndex])
  newDoc.addPage(copiedPage)

  const bytes = await newDoc.save()
  return Buffer.from(bytes)
}

/**
 * Count the number of pages in a PDF buffer.
 */
export async function countPages(pdfBuffer: Buffer): Promise<number> {
  const doc = await PDFDocument.load(pdfBuffer)
  return doc.getPageCount()
}
