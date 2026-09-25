module.exports = {
  apps: [
    {
      name: "express-api",
      script: "./server/index.js",
      cwd: "/root/missionTomirisEvents",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        PORT: 3002,
      },
    },
    {
      name: "frontend-spa",
      script: "./dist/server.cjs",
      cwd: "/root/missionTomirisEvents",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "200M",
      env: {
        NODE_ENV: "production",
        PORT: 8000,
        HOST: "0.0.0.0",
        API_PORT: 3002,
      },
    },
  ],
};
