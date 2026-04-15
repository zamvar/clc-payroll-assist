module.exports = {
  apps: [
    {
      name: 'payroll',
      script: 'npm',
      args: 'start',
      cwd: '/root/payroll',         // ← change to your home dir if not root (e.g. /home/ubuntu/payroll)
      instances: 1,                  // single instance — in-memory job store requires this
      autorestart: true,
      watch: false,                  // don't watch files — restart is manual via deploy script
      max_memory_restart: '512M',    // restart if memory exceeds 512MB (PDF processing can be heavy)
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // Logging
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
}
