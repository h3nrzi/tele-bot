/** @type {import('pm2').StartOptions} */
module.exports = {
  apps: [
    {
      name: "voltix-bot",
      script: "tsx",
      args: "src/index.ts",
      exec_mode: "fork",
      watch: false,
      max_restarts: 5,
      min_uptime: "10s",
    },
  ],
};
