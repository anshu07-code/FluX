# Deploying FluX to a VPS

One Linux server runs everything: Caddy (HTTPS), the five app services under
pm2, and PostgreSQL + Kafka in Docker. Builds run on the host so a small VPS
never runs out of memory inside a container build.

```
Internet ──► Caddy (80/443, auto-SSL)
               ├── fluxforwork.live    → localhost:3000  (Next.js)
               └── api.fluxforwork.live→ localhost:4000  (Express)
Host processes (pm2): frontend · api · processor · worker · scheduler
Containers (docker):  PostgreSQL · Kafka   ← bound to 127.0.0.1 only
```

## 0. What you need

- A VPS: **2 vCPU / 4 GB RAM**, Ubuntu 24.04 (2 GB is tight — Kafka + Postgres
  + five Node processes add up). Examples: Hetzner CX22 (~$5), DigitalOcean
  Droplet 2GB ($12), AWS Lightsail ($10), Azure VM (~$28).
- Your domain's DNS panel (Name.com for `fluxforwork.live`).
- ~30 minutes.

### Azure note (student $100 credit)

The Azure for Students subscription blocks some sizes per region, so:

- **Region: West US**, size **B2als_v2** (2 vCPU / 4 GiB, ~US$27.45/month →
  the $100 credit lasts ~3.5 months of continuous run). East US did not offer
  B-series sizes to this subscription — West US did.
- Inbound NSG rules: **22, 80, 443 only** (5432/9092 stay localhost).
- Auth: "Generate new key pair" downloads `FluX_key.pem` on create. Connect
  with `ssh -i ~/Downloads/FluX_key.pem <admin-user>@<IP>` — the admin user is
  whatever you set at creation (the Azure default is `azureuser`; ours ended up
  as `anshu07`, discoverable via `getent passwd 1000`). On Windows, if ssh
  complains the key is too open, run
  `icacls $HOME\Downloads\FluX_key.pem /inheritance:r /grant:r "$env:USERNAME:R"`.
  That account is not root — either prefix the commands in step 2 with `sudo`,
  or start with `sudo -i` once and run them as root.
- Idle **Stop (deallocate)** the VM to pause compute charges (~$8-10/month of
  disk/IP remains) — credit stretches much further.

## 1. DNS (Name.com)

Add two records **after you know the server IP**:

| Type | Host | Value |
|------|------|-------|
| A | `@` | `<server IP>` |
| A | `api` | `<server IP>` |

Propagation takes a few minutes to an hour. Everything else (SSL, CORS,
webhook URLs) derives from these two.

## 2. Server bootstrap (one time)

SSH in (`ssh root@<server-ip>` — on Azure: `ssh <admin-user>@<server-ip>`; from
PowerShell/Mac/Linux) and run:

```bash
# system updates + firewall (SSH, HTTP, HTTPS only)
apt update && apt upgrade -y
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable

# Docker (Postgres + Kafka)
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER && newgrp docker

# Node 22 (project requires 20+)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
apt install -y nodejs caddy

# pm2 process manager
npm install -g pm2
```

Postgres (5432) and Kafka (9092) bind to `127.0.0.1` in the compose file —
they are never reachable from outside, firewall or not.

## 3. Get the code + configure

```bash
git clone https://github.com/anshu07-code/FluX.git /srv/flux
cd /srv/flux
npm ci                              # installs workspaces, runs prisma generate

cp .env.example .env
cp frontend/.env.example frontend/.env.production
```

**Edit root `.env`** — fill these (the example already has sane defaults for
everything else):

```bash
# generate strong secrets (run twice, paste the outputs)
openssl rand -hex 48
```

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `"production"` (already) |
| `EXECUTION_MODE` | `"distributed"` (already) |
| `DATABASE_URL` | `"postgresql://synx:synxpass@localhost:5432/flux?schema=public"` (already) |
| `KAFKA_BROKERS` | `"localhost:9092"` (already) |
| `JWT_SECRET` | paste a generated value (min 32 chars, required) |
| `CORS_ORIGIN` | `"https://fluxforwork.live"` ← **replace localhost** |
| `APP_URL` | `"https://fluxforwork.live"` |
| `TRUST_PROXY` | `1` (already uncommented) |
| `SMTP_HOST/PORT/USER/PASS/FROM` | your Resend values (same as local) |
| `AI_API_KEY` | paste your OpenRouter key |
| `GOOGLE_CLIENT_ID/SECRET` | paste the same OAuth client (optional) |

**Edit `frontend/.env.production`:**

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `"https://api.fluxforwork.live"` |
| `AUTH_SECRET` | paste the second generated value |
| `GOOGLE_CLIENT_ID/SECRET` | same Google client (uncomment, optional) |

> `ALLOW_DEV_USER_FALLBACK` must stay **unset or false** — production startup
> refuses `"true"`.

## 4. Infrastructure + database

```bash
docker compose -f docker-compose.prod.yml up -d   # postgres + kafka
npm run migrate                                    # 11 migrations (production deploy)
npm run seed:real                                  # demo tables for database nodes
```

Wait for Kafka to be up (~10s): `docker ps` should show both containers
`Up`.

## 5. Build

```bash
npm run build    # prisma generate + next build + tsc (all five workspaces)
```

This takes a few minutes and ~1.5 GB peak — fine on a 4 GB box.

## 6. Caddy (HTTPS)

```bash
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy provisions certificates automatically on the first HTTPS request — no
certbot, no renewal cron. If DNS hasn't propagated yet, the first request may
fail; try again after `dig fluxforwork.live` shows your IP.

## 7. Start the app + persist across reboots

```bash
pm2 start ecosystem.config.js
pm2 save                 # persist the process list
pm2 startup             # print a sudo command — run the line it prints
```

Check: `pm2 list` should show five online processes
(`flux-frontend`, `flux-api`, `flux-processor`, `flux-worker`,
`flux-scheduler`).

## 8. Verify

On the server:

```bash
curl -s -o /dev/null -w "%{http_code}\n" localhost:4000/health   # 200
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000          # 200/307
curl -s -o /dev/null -w "%{http_code}\n" localhost:4000/workflows # 401 (auth required)
```

From your laptop (public path):

```powershell
curl.exe -s -o NUL -w "%{http_code}" https://fluxforwork.live            # frontend
curl.exe -s -o NUL -w "%{http_code}" https://api.fluxforwork.live/health # 200
```

Then the real checklist in a browser:

1. `https://fluxforwork.live` → register → login
2. Templates → activate a workflow → **Run** → executions show SUCCESS
3. Forgot-password → Resend mail arrives (spam folder possible on day one)
4. Settings → create an API key → the curl example should show
   `https://api.fluxforwork.live/...`

## 9. Daily operations

```bash
# deploy an update
cd /srv/flux && git pull && npm run build && pm2 restart all
# if the pull included prisma/migrations changes:
cd /srv/flux && npm run migrate && pm2 restart all

# logs / status
pm2 list
pm2 logs flux-api          # or flux-worker, flux-frontend, …
docker ps                  # infra containers

# database backup (run via cron if you care about the data)
docker exec flux-postgres pg_dump -U synx flux | gzip > /backup/flux-$(date +%F).sql.gz
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Site can't be reached (browser) | DNS not propagated, or A record missing | `dig fluxforwork.live`; fix records at Name.com |
| CORS error in browser console | `CORS_ORIGIN` still localhost on the server | edit root `.env`, `pm2 restart all` |
| `pm2 list` shows flapping processes | startup error (secret, SMTP, DB) | `pm2 logs <name>` — config errors print there and the process exits (by design) |
| Workflows stuck PENDING | Kafka container down or `EXECUTION_MODE` wrong | `docker ps`; `docker compose -f docker-compose.prod.yml up -d` |
| 502 from Caddy | app process down | `pm2 list`, `pm2 logs flux-api` |
| Server feels slow / OOM kills | box smaller than 4 GB | raise plan, or lower `KAFKA_HEAP_OPTS` further |
| Mail not arriving | Resend key or domain not verified | check Resend dashboard → Domains |

## Why hybrid (Docker only for infra)?

`next build` and `tsc` need 1–1.5 GB peak RAM. Inside a container on a small
VPS that's the classic OOM kill. Building on the host and running the built
output under pm2 keeps memory predictable, while Postgres/Kafka — the parts
that benefit from clean volumes and restarts — stay in Docker. It also means
`git pull && npm run build && pm2 restart all` is the entire update flow.
