# 02: Commit `ecosystem.config.cjs` — PM2 process configuration

**What to build:** Add a committed `ecosystem.config.cjs` file that declares the `voltix-bot` PM2 process. After this ticket, anyone (or any automation) can start the bot reproducibly using `pm2 start ecosystem.config.cjs --env production` without relying on any ad-hoc pm2 invocation or tribal knowledge. Crash loops are bounded by configured restart limits rather than spinning indefinitely.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `ecosystem.config.cjs` is committed in CommonJS format (required by PM2)
- [ ] The process entry is named `voltix-bot`, invokes `tsx src/index.ts` in `fork` mode
- [ ] `max_restarts: 5` and `min_uptime: "10s"` are set so crash loops surface as an errored process rather than spinning indefinitely
- [ ] `watch: false` is set (file-watching is not appropriate for production)
- [ ] No environment variables are inlined — the app loads them from the VPS `.env` file via its existing dotenv call
- [ ] The file is listed in `.gitignore`'s opposite (i.e., it is NOT gitignored) and commits cleanly
