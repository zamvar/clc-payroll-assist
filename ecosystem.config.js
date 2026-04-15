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
      max_memory_restart: '2G',     // restart if memory exceeds 2GB (plenty of headroom on 8GB VPS)
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        NODE_OPTIONS: '--max-old-space-size=4096',  // allow Node.js to use up to 4GB heap
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
}
