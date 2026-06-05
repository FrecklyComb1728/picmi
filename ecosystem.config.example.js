module.exports = {
  apps: [{
    name: 'picmi',
    script: '.output/server/index.mjs',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '512M',
    wait_ready: true,
    listen_timeout: 10000,
    kill_timeout: 5000,
    autorestart: true,
    env: { NODE_ENV: 'production', PORT: 3000 }
  }]
};
