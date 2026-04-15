# CLC Payroll Dispatch

A Next.js 14 (App Router) system that matches employee payslips and ledger records from bulk PDFs using a CSV roster, then dispatches individual PDF pages to each employee by email — with a real-time dashboard.

---

## How it works

```
CSV Roster (ER Code, Name, Email)
        │
        ├──► Scan Ledger PDF  → find each employee's page
        ├──► Scan Payslip PDF → find each employee's page
        │
        └──► Email each employee: Ledger page + Payslip page attached
                     │
                     └──► Real-time SSE → progress bar + dispatch log
```

---

## CSV Format

The system is pre-configured for the **CLC standard format**:

```csv
Last Name,First Name,Middle Name,Email,ER Code
Contridas,Elvin Mark,Legayada,emcontridas@adventist.ph,ERCONEL02
Apostol,Florinette,Mendoza,bapostol@adventist.ph,ERAPOFL01
```

| Column | Required | Notes |
|---|---|---|
| `ER Code` | ✅ | Primary join key — must appear in both PDFs |
| `Email` | ✅ | Destination address |
| `Last Name` | Optional | Combined with First + Middle into full name |
| `First Name` | Optional | |
| `Middle Name` | Optional | |

> The parser also accepts generic formats with `Employee ID`, `Emp ID`, `ID`, `Name`, `Email Address` column variants (case-insensitive).

---

## PDF Requirements

Both PDFs must contain the **ER Code** on each page so the system can match pages to employees.

The default regex matches:
- **Bare codes**: `ERCONEL02`, `ERFOFWA01` (auto-detected)
- **Labeled**: `ER Code: ERCONEL02`, `Employee Code: ERCONEL02`

If your PDFs use a different format, update the **Regex Pattern** field in the UI before running.

> ⚠️ **Text-based PDFs only** in this version. Scanned/image PDFs require OCR (Tesseract.js) which can be added as a later enhancement.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure SMTP

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=payroll@adventist.ph
SMTP_PASS=your-gmail-app-password
SMTP_FROM="CLC Payroll <payroll@adventist.ph>"
```

> For Gmail: enable 2FA → generate an **App Password** at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Usage

1. **Upload Roster CSV** — your employee list (ER Code, Email, Name)
2. **Upload Ledger PDF** — bulk ledger, one entry per page
3. **Upload Payslip PDF** — bulk payslips, one per page
4. **Configure SMTP** (or use `.env.local`) — click "Test Connection" to verify
5. **Click "Dispatch Payslips"** — watch the real-time progress bar

Each employee receives an email with:
- `Ledger_ERCONEL02.pdf` — their individual ledger page
- `Payslip_ERCONEL02.pdf` — their individual payslip page

---

## API Endpoints

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/process-payroll` | Upload files, start background job |
| `GET` | `/api/job-status/[jobId]` | SSE stream — real-time progress |
| `POST` | `/api/verify-smtp` | Test SMTP connection |

### POST `/api/process-payroll`

**Form fields:**

| Field | Type | Required |
|---|---|---|
| `roster` | File (CSV) | ✅ |
| `ledger` | File (PDF) | ✅ |
| `payslip` | File (PDF) | ✅ |
| `idPattern` | string | Optional — custom regex |
| `smtpConfig` | JSON string | Optional — overrides env vars |

**Response:**
```json
{ "jobId": "uuid", "total": 4, "csvWarnings": [] }
```

---

## Architecture

```
src/
├── app/
│   ├── page.tsx                        ← Dashboard UI (upload + SSE + log table)
│   ├── layout.tsx                      ← Syne + DM Mono fonts, SEO
│   ├── globals.css                     ← Design system (industrial ledger aesthetic)
│   └── api/
│       ├── process-payroll/route.ts    ← POST: parse files, spawn job
│       ├── job-status/[jobId]/route.ts ← GET: SSE real-time stream
│       └── verify-smtp/route.ts        ← POST: test SMTP
└── lib/
    ├── types.ts          ← Shared TypeScript interfaces
    ├── job-store.ts      ← In-memory job state + EventEmitter for SSE
    ├── csv-parser.ts     ← papaparse with flexible/CLC-aware header detection
    ├── pdf-processor.ts  ← Per-page text extraction (pdf-parse) + page split (pdf-lib)
    └── email-sender.ts   ← Nodemailer, dual-attachment email dispatch
```

---

## Troubleshooting

### "Could not find an Employee ID column"
Ensure your CSV has an `ER Code` column header (case-insensitive). Check for extra spaces or BOM characters.

### Pages show "No Match" in the log
The ER Code wasn't found on that PDF page. Check:
1. The PDF is text-based (not a scanned image) — try selecting text in Acrobat
2. The ER Code format matches the regex — paste a sample code in the Regex Pattern field and test

### SMTP fails
For Gmail: use an **App Password**, not your regular password. Regular passwords don't work even if 2FA is off.

### Large PDFs timeout
Processing happens server-side in Node.js. For very large batches (500+ employees), the job may take several minutes. The SSE stream keeps the browser updated. Do not close the tab while processing.
