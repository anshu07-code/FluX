import { app } from "./app.js";
import { assertDatabaseReachable, validateServiceEnv } from "./config.js";
import { prisma } from "./db.js";

// Surface any unhandled error instead of letting Node kill the process silently.
// Unhandled rejections are logged and the server keeps serving (a transient
// failure in one request must not take down the whole API).
process.on("unhandledRejection", (reason) => {
  console.error("[api] UNHANDLED REJECTION:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[api] UNCAUGHT EXCEPTION:", error);
});

// Fail fast on missing/invalid configuration BEFORE accepting any traffic.
try {
  validateServiceEnv("api");
  await assertDatabaseReachable(prisma);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const port = Number(process.env.PORT ?? 4000);

// Bounded retry for transient port conflicts (e.g. a previous instance still
// shutting down). Never loop forever — a permanently held port means a
// duplicate FluX API is running, and the process must exit so process
// managers/supervisors surface the failure instead of silently stacking
// instances that all think they're serving traffic.
//
// Each attempt uses a FRESH http.Server: re-calling listen() on a server that
// hit EADDRINUSE can re-fire stale events and log a bogus "listening".
const MAX_BIND_ATTEMPTS = 10;

function tryListen(attempt: number): void {
  // Do NOT pass the success callback to app.listen(): Express registers that
  // callback on BOTH 'listening' and 'error', so on EADDRINUSE it would print
  // a bogus "listening" line. Subscribe to the events explicitly instead.
  const server = app.listen(port);
  server.once("listening", () => {
    console.log(`FluX API listening on http://localhost:${port}`);
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      server.close();
      if (attempt < MAX_BIND_ATTEMPTS) {
        // Note: intentionally no "[api] " prefix — under `npm start`,
        // concurrently already prefixes every line with "[api] ", which used
        // to stack as "[api] [api] ...".
        console.error(
          `Port ${port} is already in use (attempt ${attempt}/${MAX_BIND_ATTEMPTS}) — retrying in 1s. ` +
            `If you did not start a second FluX API on purpose, stop the other process holding port ${port}.`
        );
        setTimeout(() => tryListen(attempt + 1), 1000);
        return;
      }
      console.error(
        `Port ${port} is still in use after ${MAX_BIND_ATTEMPTS} attempts — giving up. ` +
          `Another FluX API (or a different process) is bound to port ${port}. Stop it first, then restart.`
      );
      process.exit(1);
      return;
    }
    console.error("Server failed to start:", error);
    process.exit(1);
  });
}

tryListen(1);
