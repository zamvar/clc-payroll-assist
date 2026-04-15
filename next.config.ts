import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Keep PDF/email libs server-side only (not bundled for client)
  serverExternalPackages: ['pdf-parse', 'pdf-lib', 'nodemailer'],
}

export default nextConfig
