import type { Metadata } from 'next'
import { Syne, DM_Mono } from 'next/font/google'
import './globals.css'

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

const dmMono = DM_Mono({
  subsets: ['latin'],
  variable: '--font-dm-mono',
  weight: ['300', '400', '500'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'CLC Payroll Dispatch — Reconciliation & Email System',
  description:
    'Match employee payslips and ledger records from bulk PDFs using a CSV roster, then dispatch individual PDF attachments by email.',
  keywords: ['payroll', 'payslip', 'dispatch', 'pdf', 'email', 'reconciliation'],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${dmMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
