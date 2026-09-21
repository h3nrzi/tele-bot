# 04: Add GitHub Actions `ci` job — validate every PR and push to `main`

**What to build:** Create `.github/workflows/ci-cd.yml` with the `ci` job. After this ticket, every pull request and every direct push to `main` automatically runs a format check, type check, and full Vitest integration suite against an ephemeral PostgreSQL database. A broken PR is surfaced before it can be merged.

**Blocked by:** 01 (pnpm is the sole lockfile — `--frozen-lockfile` relies on this), 02 (ecosystem config is committed so the repo is in a clean, deployable state before CI validates it)

**Status:** done

- [x] `.github/workflows/ci-cd.yml` is created with a `ci` job
- [x] Triggers: `push` to `main` and `pull_request` targeting `main`
- [x] Steps run in order: checkout → `pnpm/action-setup` (version pinned to match `pnpm-lock.yaml`) → `actions/setup-node@v4` with Node 20 and pnpm cache → `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm exec prettier --check .` → `pnpm test`
- [x] A `postgres:16-alpine` service container is declared with the `ci` job; health-checked on port 5432 before tests run
- [x] `TEST_DATABASE_URL` env var is set to `postgres://postgres:postgres@localhost:5432/tele_bot_test` on the `ci` job, matching the project's existing global test setup expectation
- [x] Pushing a branch with a deliberate type error causes `ci` to fail
- [x] Pushing a branch with a Prettier violation causes `ci` to fail
- [x] A branch with all checks passing results in a green `ci` run
