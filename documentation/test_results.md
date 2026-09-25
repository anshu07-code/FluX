# Test results

Outputs for every number quoted in the README. Each section lists the command
that produced it so you can rerun it yourself.

---

## Static checks

```
npm run typecheck     → exit 0, 0 errors   (five workspaces + scripts/)
npm run lint          → exit 0, 0 errors   (ESLint)
```

---

## Unit / integration (Vitest)

```
npm test

Test Files  4 passed (4)
Tests      25 passed (25)
```

Covers auth (JWT + API keys), workflow CRUD, the graph engine (branch
routing, switch/condition/loop handles) and the distributed outbox flow.

One test deliberately breaks the Kafka publish to check the failure path:

```
stderr | test/distributed.test.ts > 3. Processor does not mark an event as
         published if Kafka publishing fails
Failed to publish outbox event accf6cbb-…: Error: Kafka broker connection timeout
```

That timeout is the injected fault — the assertion is that the outbox row
stays unpublished so it can be retried.

Alert tests print this in the test environment, where there's no mail server
by design:

```
[alerts] SIMULATED failure alert email → developer@flux.local | FluX alert:
         "no-trigger-1790…" failed (SMTP not configured)
```

---

## Live production harness (11 checks)

Run against a production-mode stack (`NODE_ENV=production`,
`EXECUTION_MODE=distributed`, `mocks=OFF`). Every check is a real HTTP
request.

| # | Check | Expected | Result |
|---|-------|----------|--------|
| 1 | `GET /workflows` with no auth | 401 | PASS |
| 2 | register returns a JWT | token present | PASS |
| 3 | distributed run completes | SUCCESS | PASS |
| 4 | webhook on DRAFT workflow | 404 | PASS |
| 5 | webhook on ACTIVE workflow | SUCCESS | PASS |
| 6 | `trigger.body.orderId` reaches code node | `BX-42` | PASS |
| 7 | top-level `orderId` reaches code node | `BX-42` | PASS |
| 8 | cron-only workflow via webhook | 404 | PASS |
| 9 | dashboard stats with JWT | 200 | PASS |
| 10 | run endpoint rate limit (60/min) | 429 at attempt 60–66 | PASS |
| 11 | webhook rate limit (120/min/IP) | 429 at attempt 105–140 | PASS |

```
FAILED=0/11
```

Representative detail lines from actual runs:

```
429 at attempt 61          # run budget is 60/min per identity
429 at attempt 119         # webhook budget is 120/min per IP
got=BX-42                  # wrapped payload reached the node
top=BX-42                  # flat payload reached the node
got 404                    # DRAFT webhook rejected
```

The harness creates a throwaway account and deletes it (`DELETE /auth/me`)
on both exit paths. I also check the database afterwards — baseline is 2 real
users and 5 workflows, with zero verification leftovers.

---

## E2E suites

```
npm run e2e:distributed     → ALL PASSED
npm run e2e:account         → ALL PASSED  (24 checks across the suites)
npm run e2e:fail-loud       → ALL PASSED
npm run templates:validate  → ALL PASSED  (10 fixture graphs)
npm run templates:test      → ALL PASSED
```

The fail-loud suite is the one worth looking at — it runs a workflow whose
Slack node has no webhook configured and requires the run to fail:

```
Slack node → FAILED
  "Slack node has no webhook URL configured. Add an incoming webhook URL in the node config."
execution status = FAILED
suite: ALL PASSED
```

If anyone ever reintroduces a mock success path, this suite goes red.

---

## Production boot

Starting the API with the deployed config (verified on port 4010 so it
wouldn't touch a running dev stack):

```
[env] Loaded environment from …FluX\.env
[config] api ok | NODE_ENV=production | EXECUTION_MODE=distributed |
         mocks=OFF (fail-loud, real calls only) | kafka=localhost:9092
[config] PostgreSQL connection OK.
FluX API listening on http://localhost:4010
```

The two warnings below are expected while localhost origins stay in
`CORS_ORIGIN` next to the production domain — they're warnings, not errors:

```
[config] WARNING: CORS_ORIGIN includes "http://localhost:3000" — …
[config] WARNING: CORS_ORIGIN includes "http://localhost:3001" — …
```

---

## Rate limits (measured, not assumed)

| Surface | Budget | Observed |
|---------|--------|----------|
| Workflow runs | 60/min per identity | 429 at cumulative request 61 |
| Webhooks | 120/min per IP | 429 around request 120 |
| Login/register | 30/min | same Postgres window |
| Forgot-password | 10/min | same window; without SMTP the handler 503s before mailing |

All four share `RateLimitCounter` rows in Postgres, so N API instances
enforce one budget, not N budgets.

---

## Auth behavior

| Scenario | Result |
|----------|--------|
| No / invalid `Authorization` header in production | 401 |
| Invalid API key | 401 (no dev-user fallback) |
| `JWT_SECRET` < 32 chars or a shipped placeholder | startup refuses |
| `ALLOW_DEV_USER_FALLBACK=true` in production | startup refuses |
| `DELETE /auth/me` with no JSON body | 400 "Your password is required…" (was 500) |
| Forgot-password with SMTP unset | 503 naming the missing variables |

---

## Reproducing all of it

```
# infra
docker compose -f docker-compose.kafka.yml up -d
docker run -d --name synx-postgres -p 5432:5432 \
  -e POSTGRES_USER=synx -e POSTGRES_PASSWORD=synxpass \
  -e POSTGRES_DB=flux postgres:15

# setup
cp .env.example .env && cp frontend/.env.example frontend/.env.local
npm install && npm run migrate && npm run seed:real
npm run dev

# gates (stack must be up for the E2E ones)
npm run typecheck && npm run lint && npm test
npm run e2e:distributed && npm run e2e:account && npm run e2e:fail-loud
npm run templates:validate && npm run templates:test
```
