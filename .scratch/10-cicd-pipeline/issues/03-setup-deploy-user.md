# 03: Add `setup-deploy-user.sh` — VPS least-privilege provisioning wizard

**What to build:** Commit a shell script that a human runs once as root on the VPS to provision the `deploy` OS user. After this ticket, the least-privilege SSH setup is repeatable and self-documenting: the script creates the user, scopes its `sudo` rights to PM2 stop/start only, grants write access to the repo directory, generates an ed25519 keypair, and prints the private key for the operator to paste into the GitHub `production` environment secret `SSH_PRIVATE_KEY`. A leaked key cannot be used to make arbitrary changes to the server.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Script lives at `scripts/setup-deploy-user.sh` and is executable (`chmod +x`)
- [x] Creates the `deploy` OS user idempotently (`adduser` is safe to re-run)
- [x] Adds `deploy` to the `h3nrzi` group and sets `g+w` on the repo directory so the deploy user can write to it
- [x] Writes `/etc/sudoers.d/deploy-pm2` granting `deploy` passwordless `sudo` for exactly two commands: `sudo -u h3nrzi pm2 stop voltix-bot` and `sudo -u h3nrzi pm2 start <ecosystem-path> --env production` — nothing else
- [x] Generates an `ed25519` keypair under `/home/deploy/.ssh/` and adds the public key to `authorized_keys`
- [x] Prints the private key to stdout with clear instructions for the operator to copy it into GitHub Secrets as `SSH_PRIVATE_KEY`
- [x] Prints a checklist of the GitHub `production` environment secrets the operator must set: `SSH_HOST`, `SSH_PORT`, `SSH_USER`, `SSH_PRIVATE_KEY`, `DEPLOY_PATH`, `BOT_TOKEN`, `TELEGRAM_OPS_GROUP_ID`
- [x] Script is safe to re-run after key rotation
