Status: ready-for-agent

# CI/CD Pipeline & Automated Deployment

## Problem Statement

Deployments to the Voltix Telegram bot VPS are entirely manual: a developer SSHes in, runs `git pull`, `pnpm install`, `pnpm db:migrate`, and `pm2 restart voltix-bot`. There is no automated validation gate on Pull Requests — broken code can be merged to `main` undetected. There is no automated delivery pipeline — every deploy requires human coordination and carries the risk of a missed step (e.g., forgetting to run migrations before restarting).

## Solution

Establish a GitHub Actions pipeline in a single `ci-cd.yml` workflow file with two jobs:

- **`ci`**: Validates every PR and every push to `main`. Runs Prettier format-check, TypeScript type-check, and the full Vitest integration suite against an ephemeral PostgreSQL service container.
- **`cd`**: Runs only on push to `main` after `ci` passes. SSHes into the VPS as a dedicated least-privilege `deploy` OS user, updates the repo, installs dependencies (while the bot is still live), then briefly stops the bot, runs migrations, and restarts it. Sends a Telegram alert to the ops group if the deployment fails.

The PM2 process configuration is codified in a committed `ecosystem.config.cjs` file. A one-time `setup-deploy-user.sh` wizard script provisions the `deploy` OS user and its sudoers permissions on the VPS.

## User Stories

1. As a developer, I want every PR to automatically run TypeScript type-checking, so that type errors are caught before merge.
2. As a developer, I want every PR to automatically run a Prettier format check, so that code style violations are caught before merge.
3. As a developer, I want every PR to automatically run the full Vitest integration suite against a fresh PostgreSQL database, so that broken behavior is caught before merge.
4. As a developer, I want CI to run on direct pushes to `main` as well as PRs, so that the `main` branch is always in a known-good state.
5. As a developer, I want the CD job to only trigger if CI passes, so that a broken build never gets deployed.
6. As a developer, I want CD to only trigger on pushes to `main`, not on PRs, so that feature branches are never deployed accidentally.
7. As a developer, I want the GitHub `production` environment to hold all deployment secrets, so that secrets are scoped and the deployment history is visible in the GitHub UI.
8. As a developer, I want `pnpm install` to run while the old bot is still live, so that the window during which the bot is stopped is minimised to migration + restart time (~3 s).
9. As a developer, I want `pnpm db:migrate` to run only after the old bot has stopped, so that the new schema is never applied while the old code is still serving requests.
10. As a developer, I want the bot to be restarted using a committed `ecosystem.config.cjs` file, so that the PM2 process configuration is version-controlled and reproducible.
11. As a developer, I want the deployment to perform a PM2 health check after restart, so that a silent crash loop is surfaced as a workflow failure rather than going unnoticed.
12. As an Admin, I want to receive a Telegram message in the ops group if the CD pipeline fails at any step, so that I am notified of broken deployments immediately and through the same channel as other operational events.
13. As a developer, I want a `setup-deploy-user.sh` wizard to provision the `deploy` OS user on the VPS, so that the least-privilege SSH setup is repeatable and documented rather than ad-hoc.
14. As a developer, I want the `deploy` OS user to have `sudo` rights scoped only to PM2 stop and start commands, so that a leaked SSH key cannot be used to make arbitrary changes to the server.
15. As a developer, I want `pnpm` to be the sole canonical package manager, so that lockfile drift between `pnpm-lock.yaml` and the now-deleted `package-lock.json` cannot occur.
16. As a developer, I want the PM2 process to be configured with `max_restarts: 5` and `min_uptime: 10s`, so that crash loops are caught and the process is marked as errored rather than spinning indefinitely.
17. As a developer, I want production environment variables to live only in the VPS `.env` file and never in GitHub, so that secrets are not duplicated and the bot's dotenv loading path is unchanged.
18. As a developer, I want actionable notes for enabling GitHub branch protection on `main`, so that CI becomes a hard merge gate without requiring additional code changes.

## Implementation Decisions

- **Single workflow file** `ci-cd.yml` with two jobs: `ci` and `cd`. The `cd` job declares `needs: [ci]` and `if: github.ref == 'refs/heads/main'` to ensure it only runs on `main` after CI passes.

- **GitHub Environments**: The `cd` job targets `environment: production`. All deployment secrets (`SSH_HOST`, `SSH_PORT`, `SSH_USER`, `SSH_PRIVATE_KEY`, `DEPLOY_PATH`, `BOT_TOKEN` for alerting, `TELEGRAM_OPS_GROUP_ID`) are stored in this environment, not as plain repository secrets.

- **CI postgres service**: A `postgres:16-alpine` service container is declared in the `ci` job. The `TEST_DATABASE_URL` env var is set to `postgres://postgres:postgres@localhost:5432/tele_bot_test`, matching the project's existing global test setup expectation. The global setup (`tests/setup/global-setup.ts`) applies Drizzle migrations before any suite runs; no extra migration step is needed in the CI workflow.

- **CI steps in order**: checkout → setup pnpm (pinned version from `pnpm-lock.yaml`) → setup Node 20 with pnpm cache → `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm exec prettier --check .` → `pnpm test` (with postgres service health-checked before tests run).

- **Deployment order (Order B)**: On the VPS, the SSH step executes: `git fetch && git reset --hard origin/main` → `pnpm install --frozen-lockfile` → `sudo -u h3nrzi pm2 stop voltix-bot` → `pnpm db:migrate` → `sudo -u h3nrzi pm2 start /home/h3nrzi/tele-bot/ecosystem.config.cjs --env production`. Install runs while the old process is still live; the downtime window is only stop → start.

- **PM2 ecosystem config**: A new `ecosystem.config.cjs` (CommonJS format required by PM2) declares the `voltix-bot` process running `./node_modules/.bin/tsx src/index.ts` in `fork` mode with `max_restarts: 5`, `min_uptime: "10s"`, `watch: false`. Environment variables are not inlined — the application loads them from the VPS `.env` file via its existing dotenv call.

- **`tsx` at runtime**: The bot continues to be invoked via `tsx src/index.ts`, not a compiled `dist/`. This preserves the existing runtime behaviour and avoids disrupting the `tsyringe` decorator metadata resolution path. See ADR-0014.

- **Brief deployment gap**: True zero-downtime (PM2 cluster mode with rolling reload) is not implemented. A ~3 s stop–migrate–start gap is accepted as the downtime window per deployment. See ADR-0015.

- **Dedicated `deploy` OS user**: A `setup-deploy-user.sh` script (run once as root on the VPS) creates the `deploy` user, adds it to the `h3nrzi` group, sets `g+w` on the repo directory, generates an ed25519 keypair, and writes a `/etc/sudoers.d/deploy-pm2` snippet allowing `deploy` to run `sudo -u h3nrzi pm2 stop voltix-bot` and `sudo -u h3nrzi pm2 start <ecosystem-path>` without a password. The script prints the private key for the operator to add to GitHub Secrets.

- **Telegram failure alert**: The `cd` job's failure condition triggers a `curl` POST to `https://api.telegram.org/bot${{ secrets.BOT_TOKEN }}/sendMessage` with `chat_id=${{ secrets.TELEGRAM_OPS_GROUP_ID }}`. The `BOT_TOKEN` secret in the `production` environment is used solely for this alert; the real running bot's token lives only in the VPS `.env`.

- **Package manager cleanup**: `package-lock.json` is deleted. `pnpm-lock.yaml` is the sole lockfile going forward.

## Testing Decisions

**What makes a good test for this feature**: Infrastructure correctness cannot be verified by unit tests. The correct seam is the GitHub Actions workflow run itself — a real run either passes all steps or it doesn't. There is no application-layer seam to stub or mock.

**Verification approach**:

- Push a feature branch and open a PR: observe `ci` job runs and passes (typecheck, prettier, Vitest against postgres service).
- Observe `cd` job does **not** trigger on the PR branch.
- Merge the PR to `main`: observe both `ci` and `cd` jobs run, the Deployment entry appears in GitHub's `production` environment sidebar, and `pm2 status` on the VPS shows `voltix-bot` as `online`.
- Deliberately introduce a type error on a branch: observe `ci` fails and `cd` does not run.
- Deliberately break the SSH step: observe a Telegram alert arrives in the ops group.

**Prior art**: The test harness setup in `tests/setup/global-setup.ts` and `tests/helpers/test-db.ts` demonstrates how the project already manages real-postgres integration test setup and teardown. The workflow's postgres service block mirrors the same connection parameters (`postgres:postgres@localhost:5432/tele_bot_test`).

## Out of Scope

- Docker / containerisation of the bot or its deployment
- Code coverage upload or badge generation (no `@vitest/coverage-*` installed)
- Dependabot configuration or automated dependency PRs
- Non-Telegram failure notifications (no Slack, Discord, or email alerts)
- ESLint setup (no linter is currently configured; Prettier check only)
- True zero-downtime deployment (PM2 cluster mode, Telegram webhook mode)
- GitHub branch protection rule automation (manual UI configuration only; actionable notes provided)
- Secondary environments (staging, preview) — production VPS only

## Further Notes

- The `BOT_TOKEN` secret stored in the GitHub `production` environment is used exclusively by the failure-alert curl call in the workflow. It may be the same value as the VPS `.env` `BOT_TOKEN` or a separate bot; either works. The key constraint is that the real bot token never appears in workflow logs.
- Enabling GitHub branch protection on `main` (Settings → Branches → Add rule → require `ci` status check) is the recommended companion step after the pipeline is live. It makes CI a hard merge gate without requiring any code change.
- The `setup-deploy-user.sh` wizard is intended as a one-time provisioning script. If the deploy user ever needs to be re-provisioned (e.g., after key rotation), the script is safe to re-run: `adduser` is idempotent when the user already exists, and the sudoers file is overwritten in place.
- pnpm version should be pinned in the workflow (`pnpm/action-setup` accepts a `version:` field) to match the version that generated `pnpm-lock.yaml`. Check `pnpm-lock.yaml` header for `lockfileVersion` and cross-reference the pnpm changelog if pinning to a specific minor.
