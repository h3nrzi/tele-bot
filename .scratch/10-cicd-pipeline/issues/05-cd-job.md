# 05: Add GitHub Actions `cd` job — automated deploy to VPS on merge to `main`

**What to build:** Extend `.github/workflows/ci-cd.yml` with the `cd` job. After this ticket, merging to `main` triggers a fully automated, audited deployment: the VPS pulls the new code, installs dependencies while the old bot is still live, briefly stops the bot, runs migrations, restarts it, and verifies it came back healthy. If anything fails, a Telegram message is sent to the ops group immediately. The deployment history is visible in GitHub's `production` environment sidebar.

**Blocked by:** 03 (deploy user and SSH secrets must be provisioned before the SSH step can succeed), 04 (`ci` job must exist — `cd` declares `needs: [ci]` and only runs after it passes)

**Status:** done

- [x] `cd` job is added to `.github/workflows/ci-cd.yml` with `needs: [ci]` and `if: github.ref == 'refs/heads/main'`
- [x] Job targets `environment: production` so all deployment secrets are scoped there and the deployment appears in GitHub's environment sidebar
- [x] SSH step executes the deployment sequence in order: `git fetch && git reset --hard origin/main` → `pnpm install --frozen-lockfile` (bot still live) → `sudo -u h3nrzi pm2 stop voltix-bot` → `pnpm db:migrate` → `sudo -u h3nrzi pm2 start /home/h3nrzi/tele-bot/ecosystem.config.cjs --env production`
- [x] A PM2 health check step runs after restart (e.g., `pm2 list` grep for `voltix-bot` in `online` state) and fails the job if the process is not online
- [x] An `if: failure()` step sends a `curl` POST to the Telegram Bot API (`chat_id: ${{ secrets.TELEGRAM_OPS_GROUP_ID }}`) with a descriptive failure message; uses `secrets.BOT_TOKEN` from the `production` environment
- [x] `cd` does NOT trigger on PRs or branches — only on push to `main`
- [x] A deliberate SSH failure results in a Telegram alert arriving in the ops group
- [x] After a successful deploy, `pm2 status` on the VPS shows `voltix-bot` as `online`
