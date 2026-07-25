# Deploying to Oracle Cloud (Always Free tier)

This app now runs as a normal Node.js server (Nitro's `node-server` preset)
backed by Postgres, instead of browser-local IndexedDB. This is a runbook
for standing that up on one Oracle Cloud "Always Free" Ampere A1 VM — Node
app and Postgres on the same box to start, which comfortably fits inside the
free tier's 4 OCPU / 24GB headroom for a church-scale install.

Everything here is a command you run yourself against your own Oracle
account/VM — there's no way for an assistant to do this step for you without
a reachable SSH target.

## 1. Provision the VM

In the OCI console: **Compute → Instances → Create Instance**.

- Shape: **Ampere A1 (Arm)**, e.g. 2 OCPU / 12GB RAM (well within the 4
  OCPU / 24GB Always Free allowance; you can split into more VMs later if
  you ever want Postgres on its own box).
- Image: **Ubuntu 24.04** (or 22.04) — most mainstream Node/Postgres
  package/documentation support.
- Add your SSH public key during creation.
- **Networking — two separate firewalls, both default-closed for 80/443**:
  1. Oracle's cloud-level firewall (the VM's attached Security List /
     Network Security Group). In the console: your VNIC's subnet →
     Security Lists → Add Ingress Rules for `0.0.0.0/0` → TCP destination
     port `80`, and again for `443`.
  2. **Also** the VM's own `iptables`, which on Oracle's stock Ubuntu image
     only `ACCEPT`s new inbound connections on port 22 by default and
     `REJECT`s everything else — opening the Security List alone is not
     enough. On the VM:
     ```bash
     sudo iptables -I INPUT 5 -p tcp -m state --state NEW -m tcp --dport 80 -j ACCEPT
     sudo iptables -I INPUT 6 -p tcp -m state --state NEW -m tcp --dport 443 -j ACCEPT
     sudo apt install -y iptables-persistent   # persists the rules across reboot
     ```
     (Insert position `5`/`6` assumes the stock rule order — run
     `sudo iptables -L INPUT -n --line-numbers` first and insert just above
     the final `REJECT` line if it differs.)
  Both must be open — Nginx can be listening correctly and still be
  completely unreachable from outside if either layer blocks it.

SSH in: `ssh ubuntu@<your-vm-public-ip>`

## 2. Install Node, Bun, Postgres, Nginx

```bash
sudo apt update && sudo apt upgrade -y

# Node LTS (needed at runtime; bun is only used for install/build below)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Bun — this project's canonical package manager (bun.lock is the committed
# lockfile; a plain `npm install` has no lockfile to pin against and will
# ERESOLVE-fail re-resolving the tree fresh, e.g. @hookform/resolvers's
# optional valibot peer conflicting with a different transitive valibot)
sudo apt install -y unzip
curl -fsSL https://bun.sh/install | bash
# adds ~/.bun/bin to PATH via ~/.bashrc — `source ~/.bashrc` or start a new
# shell before using `bun` below

# Postgres
sudo apt install -y postgresql postgresql-contrib

# Nginx (reverse proxy + TLS termination)
sudo apt install -y nginx
```

## 3. Create the database and app_user role

```bash
sudo -u postgres psql -c "CREATE DATABASE mychurch;"
```

Clone/copy this repo onto the VM, `bun install --frozen-lockfile`, then set
up `.env` (see `.env.example`) — for local-box Postgres,
`DATABASE_URL_MIGRATE` uses the `postgres` superuser, `DATABASE_URL` uses
the `app_user` role you're about to create:

```bash
cp .env.example .env
# edit .env: DATABASE_URL_MIGRATE, DATABASE_URL (with a real app_user
# password you choose), SESSION_SECRET (generate via the command in the
# file), NODE_ENV=production
```

Create the `app_user` role first (edit the password in the script to match
what you put in `.env`'s `DATABASE_URL`) — the migration below creates RLS
policies scoped `TO "app_user"`, which requires the role to already exist:

```bash
sudo -u postgres psql -d mychurch -f scripts/db-setup.sql
```

Then run migrations (creates every table and RLS policy; also re-grants
DML access on the newly created tables — safe to run `db-setup.sql` again
after this if you ever want to double check grants):

```bash
bun run db:migrate
```

Create the first SuperAdmin account (platform-level — the person who can
onboard churches; separate from any church's own Admin):

```bash
PLATFORM_ADMIN_EMAIL=you@example.com \
PLATFORM_ADMIN_PASSWORD='choose-a-strong-one' \
PLATFORM_ADMIN_NAME="Your Name" \
bun run db:seed-admin
```

## 4. Build and run the app

```bash
bun run build
```

This defaults to the `node-server` Nitro preset (no `NITRO_PRESET` env var
needed — that's now the project default; `build:cloudflare` and
`build:pages` remain available if you ever want those targets instead).

Run it as a systemd service so it restarts on crash/reboot. Create
`/etc/systemd/system/mychurch.service`:

```ini
[Unit]
Description=My Church app
After=network.target postgresql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/my-church-mvp
EnvironmentFile=/home/ubuntu/my-church-mvp/.env
Environment=PORT=3000
ExecStart=/usr/bin/node .output/server/index.mjs
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mychurch
sudo systemctl status mychurch   # should show "active (running)"
```

## 5. Nginx reverse proxy + TLS

`/etc/nginx/sites-available/mychurch`:

```nginx
server {
    listen 80;
    server_name your-domain.example;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/mychurch /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Once your domain's DNS A record points at the VM's public IP, get a real
certificate:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example
```

Certbot rewrites the Nginx config to redirect HTTP→HTTPS and auto-renews via
a systemd timer it installs.

## 6. Redeploying after a code change

```bash
git pull
bun install --frozen-lockfile
bun run build
bun run db:migrate   # only if the schema changed
sudo systemctl restart mychurch
```

## What's NOT wired up yet

- **Email delivery**: invite links and password-reset tokens are generated
  server-side but not emailed — relay them out-of-band for now (shown
  directly in the SuperAdmin UI after creating an organization).
- **The in-church app itself** (dashboard, members, cells, givings, …)
  still runs on browser-local IndexedDB — only the platform-level SuperAdmin
  flow (`/superadmin`) and the Members module's server-side data layer are
  live against Postgres so far. Migrating the rest of the app's login and
  each module is tracked as follow-up work, module by module, following the
  pattern in `src/server/members.ts`.
