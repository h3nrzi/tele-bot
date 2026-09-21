# 01: Remove `package-lock.json` and lock pnpm as sole package manager

**What to build:** Delete `package-lock.json` from the repository and add a guardrail that rejects `npm install` and `yarn` at the project level, so `pnpm-lock.yaml` is the only lockfile that can ever exist. After this ticket, a developer who accidentally runs `npm install` gets an immediate, clear error instead of silently creating lockfile drift.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `package-lock.json` is deleted and `.gitignore` is updated to ignore it going forward
- [ ] An `.npmrc` file (or equivalent `package.json` `packageManager` field with corepack) is committed that causes `npm install` and `yarn install` to fail with a clear message
- [ ] `pnpm install --frozen-lockfile` still succeeds against the existing `pnpm-lock.yaml`
- [ ] The change is verified locally (running `npm install` in the repo produces an error)
