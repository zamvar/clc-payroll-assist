import Papa from 'papaparse'
import type { Employee } from './types'

/**
 * Parse a CSV string into a Map keyed by Employee ID (ER Code).
 *
 * Supports the following CSV formats:
 *
 * Format A — combined columns:
 *   Employee ID | Name | Email
 *   (also: Emp ID, EmployeeID, ID, etc.)
 *
 * Format B — CLC standard format:
 *   Last Name | First Name | Middle Name | Email | ER Code
 *
 * The parser auto-detects which format is in use.
 */
export function parseRosterCSV(csvText: string): {
  map: Map<string, Employee>
  errors: string[]
} {
  const errors: string[] = []
  const map = new Map<string, Employee>()

  // Strip BOM if present
  const cleaned = csvText.replace(/^\uFEFF/, '')

  const result = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  })

  if (result.errors.length > 0) {
    result.errors.forEach((e) => errors.push(`CSV parse error row ${e.row}: ${e.message}`))
  }

  if (!result.data || result.data.length === 0) {
    errors.push('CSV file appears to be empty or has no data rows.')
    return { map, errors }
  }

  const headers = Object.keys(result.data[0] ?? {})

  // ── Detect ID column ──────────────────────────────────────────────────────
  const idKey = findHeader(headers, [
    // CLC standard
    'er code', 'er_code', 'ercode', 'er-code',
    // Generic variants
    'employee id', 'emp id', 'employeeid', 'empid',
    'employee_id', 'emp_no', 'employee no', 'employee number',
    'id no', 'id number', 'id',
  ])

  // ── Detect email column ───────────────────────────────────────────────────
  const emailKey = findHeader(headers, [
    'email', 'email address', 'emailaddress', 'e-mail', 'email_address',
  ])

  // ── Detect name column(s) ─────────────────────────────────────────────────
  // Format A: single "name" / "full name" column
  const singleNameKey = findHeader(headers, [
    'employee name', 'name', 'full name', 'fullname', 'employee_name',
  ])

  // Format B: split columns (CLC standard)
  const lastNameKey  = findHeader(headers, ['last name', 'last_name', 'lastname', 'surname', 'lname'])
  const firstNameKey = findHeader(headers, ['first name', 'first_name', 'firstname', 'given name', 'fname'])
  const middleNameKey = findHeader(headers, ['middle name', 'middle_name', 'middlename', 'mname', 'middle initial', 'mi'])

  // ── Validation ────────────────────────────────────────────────────────────
  if (!idKey) {
    errors.push(
      `Could not find an Employee ID column. Headers found: ${headers.join(', ')}. ` +
      `Expected one of: "ER Code", "Employee ID", "ID", etc.`
    )
    return { map, errors }
  }

  if (!emailKey) {
    errors.push(
      `Could not find an Email column. Headers found: ${headers.join(', ')}`
    )
    return { map, errors }
  }

  // ── Parse rows ────────────────────────────────────────────────────────────
  result.data.forEach((row, i) => {
    const rawId = row[idKey]?.trim()
    const email = row[emailKey]?.trim()

    if (!rawId) {
      errors.push(`Row ${i + 2}: missing Employee ID (${idKey}) — skipped.`)
      return
    }
    if (!email || !email.includes('@')) {
      errors.push(`Row ${i + 2}: invalid or missing email for ID "${rawId}" — skipped.`)
      return
    }

    // Build full name
    let name: string
    let firstName: string | undefined
    let lastName: string | undefined

    if (singleNameKey && row[singleNameKey]?.trim()) {
      name = row[singleNameKey].trim()
      // Try to split: assume "First Last" format
      const parts = name.split(/\s+/)
      firstName = parts[0]
      lastName = parts[parts.length - 1]
    } else if (firstNameKey || lastNameKey) {
      firstName  = firstNameKey  ? row[firstNameKey]?.trim()  : undefined
      lastName   = lastNameKey   ? row[lastNameKey]?.trim()   : undefined
      const middle = middleNameKey ? row[middleNameKey]?.trim() : undefined
      const parts = [firstName, middle, lastName].filter(Boolean)
      name = parts.join(' ')
    } else {
      name      = rawId // fallback — use ID as name if no name columns found
      firstName = undefined
      lastName  = undefined
    }

    map.set(rawId, { id: rawId, name, firstName, lastName, email })
  })

  return { map, errors }
}

function findHeader(headers: string[], candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const match = headers.find((h) => h === candidate)
    if (match) return match
  }
  return undefined
}
