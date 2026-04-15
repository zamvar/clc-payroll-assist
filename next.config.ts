import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  // Tell Next.js the workspace root is this directory — prevents confusion
  // when a parent folder also has a package-lock.json
  outputFileTracingRoot: path.join(__dirname),
  // Keep PDF/email libs server-side only (not bundled for client)
  serverExternalPackages: ['pdf-parse', 'pdf-lib', 'nodemailer'],
}

export default nextConfig
