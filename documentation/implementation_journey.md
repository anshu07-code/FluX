# Implementation journey

Phase-by-phase notes on how FluX got built — what the first version looked
like, what broke once it was running for real, and what each fix ended up
being. Not a design doc; more like a build log.

---

## Phase 1 — The graph model

I didn't want another trigger→action tool, so the core object from day one
was a graph: `Workflow` owns `WorkflowNode` rows (typed) and `WorkflowEdge`
rows (labelled by handle). The Prisma schema went through 11 migrations while
I figured out the right shape — that's what migrations are for.

On the frontend it's a React Flow canvas: drag a node on, configure it
through a schema-driven panel, connect typed handles (`true`/`false`,
`case1`/`case2`/`default`, `done`). The node catalog currently has 22 types —
http, ai, code, switch, loop, email, database, slack, auth, wait, and so on.

Execution started in-process (`EXECUTION_MODE=local`): walk the graph, run one
node, resolve the next edges, repeat, persisting every step so the UI could
show a live timeline.

Templates came next — 40 graphs across IT Ops, DevOps, SecOps, Sales, HR,
Finance, E-Commerce and Support. Each one gets checked for connectivity, a
single entry point, and no cycles.

**First real bug:** loop nodes emitted an `each` handle, but the edges were
wired to `done`. So iterations finished and the path just stopped. Trivial
fix, but it's the kind of thing you only see when you actually run a loop
end to end.

---

## Phase 2 — Going distributed

Running everything inside the API process means every deploy drops runs on
the floor and you can't scale past one box. So the execution path was split:

- The API writes the execution row **and** an outbox event in one Postgres
  transaction. No crash window where a run exists without its event.
- The processor polls the outbox (roughly every second) and publishes to a
  Kafka topic, `flux-execution-events` — 6 partitions, keyed by execution id
  so one run stays ordered while different runs run in parallel.
- Workers consume events, execute a single node, save the step, and write the
  next node's outbox entry in one transaction. Same atomic pattern, chained.
- The scheduler owns time: node-cron for cron triggers (only for ACTIVE
  workflows) and resuming runs that `WAIT`/`DELAY` parked as `WAITING`.

Five workspaces now: `frontend`, `api`, `processor`, `worker`, `scheduler`,
all sharing one schema.

What I actually tested: runs completing through the full path with 6 workers
at once, across an API restart, and with the Kafka broker killed and brought
back. There's also a unit test for the failure case that's easy to get wrong —
if the Kafka publish fails, the processor must *not* mark the outbox row
published. Otherwise the event is lost forever.

---

## Phase 3 — The fan-out bug

This one was embarrassing and important.

When a switch didn't match any rule, the engine treated the default as
"follow every outgoing edge". That's fine for a merge-style node, but wrong
for a switch — the outgoing edges are mutually exclusive by definition.

How I noticed: reading execution history for one of the seeded workflows and
seeing the Slack node *and* the email node both SUCCESS in the *same* run. One
event, two branches, should be impossible.

`determineNextEdges` now takes the handle the node actually produced
(`case1`, `default`, `true`, `done`, …) and follows only edges labelled for
that handle. If nothing is wired to the evaluated label, it falls back to
unlabelled "main" edges, and if there are none, the path ends — same as a
terminal node.

A side effect people notice in the UI: if your webhook payload doesn't carry
the value the switch is looking for, only trigger + switch run and the
execution reports SUCCESS. That's not a bug — nothing was wired to `default`,
so the path ended. Wire a `default` edge if you want a fallback.

---

## Phase 4 — Turning mocks off in production

The simulated responses for SMTP/AI/Slack make development much nicer: you
build the workflow without real credentials. The problem was that the same
code path was reachable with `NODE_ENV=production`, where "email sent!" is a
lie.

Production now refuses every shortcut:

- unconfigured SMTP / AI / Slack / DB nodes fail the run with the actual
  missing configuration
- `JWT_SECRET` shorter than 32 chars, or still a shipped placeholder →
  startup aborts
- `ALLOW_DEV_USER_FALLBACK=true` in production → startup aborts (it would
  hand anonymous callers a shared account)
- forgot-password with no SMTP → 503 naming the missing variables
- invalid JWT or API key → 401, never a quiet fallback to the dev user

`npm run e2e:fail-loud` exists specifically to keep this honest: it runs a
workflow with an unconfigured Slack node and fails the suite if the run
doesn't end FAILED. Last output looked like:

```
"Slack node has no webhook URL configured. Add an incoming webhook URL in the node config."
execution status = FAILED
suite: ALL PASSED
```

---

## Phase 5 — Small HTTP things that caused real 500s

- **Raw body destructuring.** `const { email } = req.body` throws when there's
  no JSON body. This was live on three auth endpoints (`PUT /auth/me`,
  `PUT /auth/password`, `DELETE /auth/me`). Now `req.body ?? {}` everywhere —
  a bodiless `DELETE /auth/me` correctly returns 400 "Your password is
  required" instead of a TypeError.
- **Payload shape.** Templates and external callers disagreed on where fields
  live, so the webhook receiver accepts both `trigger.body.orderId` and a
  top-level `orderId`. Both are covered in the live harness (both reach a
  code node as `BX-42`).
- **Status gating.** The UI implies that DRAFT means paused, but the webhook
  route didn't care. Now: DRAFT → 404, cron-only workflow called via webhook
  → 404. The workflow id in the path is the secret.
- **Placeholder recipients.** `user@example.com`-style addresses in
  production are rejected instead of mailing nobody.

---

## Phase 6 — Rate limits that work with more than one API instance

First version used in-memory counters. Fine for one process; with two API
instances each kept its own count, so the effective budget doubled — and
resets on restart.

Moved to fixed windows in Postgres (`RateLimitCounter`) written with an
atomic upsert: login 30/min, forgot-password 10/min, runs 60/min per
identity, webhooks 120/min per IP. `TRUST_PROXY=1` (only set when actually
behind a proxy) makes the limiter key on the real client IP from
`X-Forwarded-For`.

Measured against the running stack: the run endpoint 429s at the 61st
cumulative request, webhooks around the 120th.

---

## Phase 7 — Tests, harness, cleanup

- 25 Vitest tests over auth, workflow CRUD, the graph engine (branch
  semantics especially) and the outbox flow, including the failed-publish
  case.
- A live 11-check harness I run against a production-mode stack: 401s, DRAFT
  404s, both payload shapes, dashboard auth, both rate-limit budgets.
- Four E2E suites wired into npm scripts — `e2e:distributed`, `e2e:account`,
  `e2e:fail-loud`, plus template validation. They all clean up after
  themselves; `validate-templates` even deletes its throwaway account on both
  exit paths.
- Hygiene pass: removed a dangerous mass-delete script I'd been using for
  cleanup, dropped dead npm scripts and unused dependencies, made the root
  typecheck cover `scripts/` too, and reconciled the README with
  `package.json` so every documented command actually exists.

---

## Phase 8 — Real domain and deploy config

- `fluxforwork.live` added to `CORS_ORIGIN` **alongside** localhost entries
  (comma-separated), so deployed browsers and local dev both work off the
  same `.env`.
- `APP_URL` set for password-reset links, `TRUST_PROXY=1` for nginx,
  OpenRouter referer updated.
- Frontend env split: `frontend/.env.local` for `next dev`,
  `frontend/.env.production` for builds — no manual swapping when deploying.
- Mail moved to Resend with DKIM/SPF verified for the domain; Google OAuth
  origins/redirects documented for both localhost and production.
- Boot-tested the production config on a separate port before trusting it:

```
[config] api ok | NODE_ENV=production | EXECUTION_MODE=distributed | mocks=OFF | kafka=localhost:9092
FluX API listening on http://localhost:4010
```

---

## What the code now insists on

1. Execution + outbox + steps commit together or not at all.
2. A branching node follows one handle; an unwired branch ends the path.
3. Production reports missing configuration as failure, never as success.
4. Bad credentials are rejected, not downgraded.
5. Rate budgets live in the database, shared by every instance.
6. Every claim above has a command that proves it.
