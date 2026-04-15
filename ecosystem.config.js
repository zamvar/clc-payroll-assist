module.exports = {
  apps: [
    {
      name: 'payroll',
      script: 'npm',
      args: 'start',
      cwd: __dirname,                // resolves to the folder containing this file
      exec_mode: 'fork',             // fork mode — correct for single-instance Next.js
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        NODE_OPTIONS: '--max-old-space-size=4096',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
}
