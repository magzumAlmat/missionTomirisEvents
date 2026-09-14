module.exports = {
  apps: [
    {
      name: "event-tomiris-server",
      script: "./server/index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "video-bot",
      script: "./server/videoBot.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
