# Self-Hosting on Ubuntu VPS

## Prerequisites

- Ubuntu 22.04 or 24.04 VPS
- A domain name pointed to your VPS IP (optional but recommended for HTTPS)
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

## 4. Run with PM2 (keeps it alive after reboot)

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
# Visit http://your-vps-ip:3000 to test
```

---

## 5. Nginx Reverse Proxy

```bash
sudo apt install -y nginx

sudo nano /etc/nginx/sites-available/payroll
```

Paste this config (replace `your-domain.com` with your domain or VPS IP):

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Required for SSE (real-time job status stream)
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/payroll /etc/nginx/sites-enabled/
sudo nginx -t          # check for config errors
sudo systemctl reload nginx
```

---

## 6. HTTPS with Let's Encrypt (requires a domain)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Certbot auto-renews — no manual action needed after this.

---

## 7. Deploying Updates

Whenever you push new code to GitHub, SSH into the VPS and run:

```bash
cd /var/www/payroll
git pull
npm install
npm run build
pm2 restart payroll
```

Or save this as a script:

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

## Firewall (if UFW is enabled)

```bash
sudo ufw allow 22      # SSH
sudo ufw allow 80      # HTTP
sudo ufw allow 443     # HTTPS
sudo ufw enable
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `502 Bad Gateway` | App not running — check `pm2 status` and `pm2 logs payroll` |
| SSE disconnects instantly | Check `proxy_buffering off` is in Nginx config |
| Build fails | Check Node version: `node -v` must be ≥ 20 |
| App crashes on start | Check `.env.local` exists and has no typos |
| Permission denied | Run `sudo chown -R $USER:$USER /var/www/payroll` |
