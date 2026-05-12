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
  // Use global flag 'g' to find all matches on the page, avoiding the "Employee Name" trap
  const regex = new RegExp(idPattern, 'gi')
  const texts = await extractPagesText(pdfBuffer)

  return texts.map((text, pageIndex) => {
    const matches = [...text.matchAll(regex)]
    let rawId: string | null = null

    if (matches.length > 0) {
      for (const match of matches) {
        // Use first non-empty capture group
        const found = match.slice(1).find((g) => g && g.trim())?.trim()
        // Ensure what we capture actually looks like an ER code to avoid false positives
        if (found && found.toUpperCase().startsWith('ER')) {
          rawId = found.toUpperCase()
          break
        }
      }
    }

    return { pageIndex, rawId, text }
  })
}

// ─── Fuzzy matching ───────────────────────────────────────────────────────────

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Compute how many trailing characters of `full` are missing from `partial`.
 * Returns the number of missing chars if `partial` is a prefix of `full`
 * (meaning the PDF exported a truncated ER Code), or -1 if not a prefix.
 */
function trailingCharsMissing(full: string, partial: string): number {
  if (!partial || partial.length >= full.length) return -1
  const f = full.toUpperCase()
  const p = partial.toUpperCase()
  if (f.startsWith(p)) return f.length - p.length
  return -1
}

/**
 * Name-based fallback: score each candidate page by how many words from
 * the employee's first/last name appear in the page text.
 */
function nameFallback(employee: Employee, candidates: PageData[], minScore = 1): number | null {
  const firstName = employee.firstName?.trim() ?? ''
  const lastName  = employee.lastName?.trim()  ?? ''

  if (!firstName && !lastName) return null

  const scored = candidates
    .map((p) => {
      const text = p.text.toLowerCase()
      let score = 0
      
      // Use word boundaries to prevent "Ri" from matching "Richard"
      const hasFirst = firstName && new RegExp(`\\b${escapeRegex(firstName)}\\b`, 'i').test(text)
      const hasLast  = lastName && new RegExp(`\\b${escapeRegex(lastName)}\\b`, 'i').test(text)
      
      // Fallback to substring if word boundary fails (e.g. "MENDOZA,RIMER" without spaces)
      const hasFirstSub = !hasFirst && firstName && text.includes(firstName.toLowerCase())
      const hasLastSub  = !hasLast && lastName && text.includes(lastName.toLowerCase())

      if (hasFirst) score += 3
      else if (hasFirstSub) score += 1

      if (hasLast) score += 3
      else if (hasLastSub) score += 1

      // Bonus: both present
      if ((hasFirst || hasFirstSub) && (hasLast || hasLastSub)) score += 2

      return { pageIndex: p.pageIndex, score }
    })
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return null

  // Only return a match if the top scorer is unambiguously better than the runner-up.
  if (scored.length === 1 || scored[0].score > scored[1].score) {
    return scored[0].pageIndex
  }

  // Tied — do not guess
  return null
}

/**
 * Find the best-matching page for an employee using a 3-tier strategy.
 */
export function matchEmployeeToPage(
  employee: Employee,
  pages: PageData[]
): { pageIndex: number; matchType: 'exact' | 'fuzzy-1' | 'fuzzy-2' | 'name' } | null {
  const empId = employee.id.toUpperCase()

  // ── Tier 1: Exact match (Case Insensitive) ─────────────────────────────
  const exactMatches = pages.filter((p) => p.rawId?.toUpperCase() === empId)

  if (exactMatches.length === 1) {
    return { pageIndex: exactMatches[0].pageIndex, matchType: 'exact' }
  }
  if (exactMatches.length > 1) {
    const idx = nameFallback(employee, exactMatches)
    return idx != null ? { pageIndex: idx, matchType: 'name' } : null
  }

  // ── Tier 1.5: Text substring exact match (ignoring whitespace) ─────────
  // Sometimes pdf-parse adds weird spaces (e.g., "ER BONGI 01") or the regex fails.
  const empIdNoSpaces = empId.replace(/\s+/g, '')
  if (empIdNoSpaces.length >= 5) {
    const substringMatches = pages.filter((p) => 
      p.text.replace(/\s+/g, '').toUpperCase().includes(empIdNoSpaces)
    )
    if (substringMatches.length === 1) {
      return { pageIndex: substringMatches[0].pageIndex, matchType: 'exact' }
    }
    if (substringMatches.length > 1) {
      const idx = nameFallback(employee, substringMatches)
      if (idx != null) return { pageIndex: idx, matchType: 'name' }
    }
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
  if (employee.firstName && employee.lastName) {
    // Require a strong score (e.g. both substrings found = 4, or one word boundary + substring = 6)
    const idx = nameFallback(employee, pages, 4)
    return idx != null ? { pageIndex: idx, matchType: 'name' } : null
  }

  return null
}

// ─── Page extraction ─────────────────────────────────────────────────────────

/**
 * Load a PDF buffer into a PDFDocument object.
 * Call this ONCE per PDF and reuse the result across all employees
 * — avoids parsing the entire PDF for every extractSinglePageFromDoc call.
 */
export async function loadPdf(buffer: Buffer): Promise<PDFDocument> {
  return PDFDocument.load(buffer)
}

/**
 * Extract a single page from an already-loaded PDFDocument.
 * Use this inside the employee loop — the doc was pre-loaded by loadPdf().
 *
 * @param srcDoc    Pre-loaded source PDFDocument (call loadPdf() once, reuse here)
 * @param pageIndex 0-based page index
 */
export async function extractSinglePageFromDoc(
  srcDoc: PDFDocument,
  pageIndex: number
): Promise<Buffer> {
  const newDoc = await PDFDocument.create()
  const [copiedPage] = await newDoc.copyPages(srcDoc, [pageIndex])
  newDoc.addPage(copiedPage)
  const bytes = await newDoc.save()
  return Buffer.from(bytes)
}

/**
 * Extract a single page from a PDF buffer and return it as a new single-page PDF Buffer.
 * @deprecated Use loadPdf() + extractSinglePageFromDoc() for batch operations.
 *
 * @param pdfBuffer  Source PDF bytes
 * @param pageIndex  0-based page index
 */
export async function extractSinglePage(
  pdfBuffer: Buffer,
  pageIndex: number
): Promise<Buffer> {
  const srcDoc = await PDFDocument.load(pdfBuffer)
  return extractSinglePageFromDoc(srcDoc, pageIndex)
}

/**
 * Count the number of pages in a PDF buffer.
 */
export async function countPages(pdfBuffer: Buffer): Promise<number> {
  const doc = await PDFDocument.load(pdfBuffer)
  return doc.getPageCount()
}
