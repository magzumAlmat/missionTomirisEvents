module.exports = {
  apps: [
    {
      name: 'event-tomiris-server',
      script: './server/index.js',
      cwd: '/root/missionTomirisEvents',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    }
  ],
};
