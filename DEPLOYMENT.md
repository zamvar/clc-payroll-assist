# Self-Hosting on Ubuntu VPS

## Prerequisites

- Ubuntu 22.04 or 24.04 VPS
- Root or sudo access

---

## 1. Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # should print v20.x.x
```

---

## 2. Clone and Build

```bash
sudo mkdir -p /var/www
cd /var/www
sudo git clone https://github.com/zamvar/clc-payroll-assist.git payroll
sudo chown -R $USER:$USER /var/www/payroll
cd /var/www/payroll

npm install
npm run build
```

---

## 3. Create Environment File

```bash
nano /var/www/payroll/.env.local
```

Paste the following and fill in your values:

```env
# Port (change to whatever you want)
PORT=3000

# SMTP (Gmail App Password)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=clcpayroll@adventist.ph
SMTP_FROM=CLC Payroll <clcpayroll@adventist.ph>
SMTP_PASS=your-gmail-app-password

# Auth
ACCESS_PASSWORD=your-login-password
COOKIE_SECRET=run-openssl-rand-hex-32-and-paste-here
```

Generate a secure `COOKIE_SECRET`:

```bash
openssl rand -hex 32
```

---

## 4. Open Port in Firewall

```bash
sudo ufw allow 3000   # change to match your PORT above
sudo ufw allow 22     # keep SSH open!
sudo ufw enable
```

---

## 5. Run with PM2 (keeps it alive after reboot)

```bash
sudo npm install -g pm2

cd /var/www/payroll
pm2 start npm --name payroll -- start
pm2 save

# Auto-start on server reboot:
pm2 startup
# ↑ follow the exact command it prints and run it
```

Verify it's running:

```bash
pm2 status
```

Visit: `http://your-vps-ip:3000`

---

## 6. Deploying Updates

Whenever you push new code to GitHub, SSH into the VPS and run:

```bash
cd /var/www/payroll && git pull && npm install && npm run build && pm2 restart payroll
```

Or save it as a script:

```bash
nano /var/www/deploy.sh
```

```bash
#!/bin/bash
set -e
cd /var/www/payroll
git pull
npm install
npm run build
pm2 restart payroll
echo "✅ Deployed successfully"
```

```bash
chmod +x /var/www/deploy.sh
# To deploy: bash /var/www/deploy.sh
```

---

## Useful PM2 Commands

```bash
pm2 status              # check if app is running
pm2 logs payroll        # live logs
pm2 logs payroll --lines 50  # last 50 lines
pm2 restart payroll     # restart after config changes
pm2 stop payroll        # stop the app
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Can't reach the app | Check `pm2 status` and `sudo ufw status` — port must be open |
| App crashes on start | Run `pm2 logs payroll` — usually a missing `.env.local` value |
| Build fails | Check Node version: `node -v` must be ≥ 20 |
| Permission denied | Run `sudo chown -R $USER:$USER /var/www/payroll` |
| SSE disconnects | This is a browser issue — refresh and resubmit |
