import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests must be deterministic regardless of the developer's root .env:
    //  - NODE_ENV=test keeps fail-loud-in-production disabled (the graph-engine
    //    tests intentionally exercise documented dev/test mock behavior).
    //  - EXECUTION_MODE=local executes runs in-process. With "distributed" the
    //    runs would queue to the real worker, which boots from the root .env in
    //    production mode (mocks OFF) and requires live Kafka — a transport
    //    concern that test/distributed.test.ts covers explicitly instead.
    env: {
      NODE_ENV: "test",
      EXECUTION_MODE: "local",
      // Neutralize real mail credentials: workflow email nodes must hit the
      // simulated path in tests (the root .env's live SMTP key would otherwise
      // send — and Resend rejects the tests' example.com recipients with a 550).
      SMTP_HOST: "",
      SMTP_USER: "",
      SMTP_PASS: "",
    },
  },
});
