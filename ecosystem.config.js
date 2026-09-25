// pm2 process map for the five app services. Infrastructure (Postgres, Kafka)
// lives in docker-compose.prod.yml; Caddy is installed on the host.
//
//   pm2 start ecosystem.config.js
//   pm2 save && pm2 startup   # survive reboots
//
// Each service runs the exact npm script the local `npm start` uses, so the
// build output paths stay consistent. pm2 restarts a crashed service on its
// own instead of killing the whole stack (unlike `npm start`, which is meant
// to fail loud locally).
module.exports = {
  apps: [
    {
      name: "flux-frontend",
      cwd: __dirname,
      script: "npm",
      args: "run start --workspace=frontend",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      name: "flux-api",
      cwd: __dirname,
      script: "npm",
      args: "run start --workspace=api",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      name: "flux-processor",
      cwd: __dirname,
      script: "npm",
      args: "run start --workspace=processor",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      name: "flux-worker",
      cwd: __dirname,
      script: "npm",
      args: "run start --workspace=worker",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      name: "flux-scheduler",
      cwd: __dirname,
      script: "npm",
      args: "run start --workspace=scheduler",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
};
