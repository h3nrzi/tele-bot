# VPS Preparation Guide for CI/CD Automated Deployment

This guide walks you through preparing the production VPS (`2.28.234.187`) for automated deployments via GitHub Actions, adhering to the specifications codified in `10-cicd-pipeline`.

---

## Architecture Overview

```mermaid
flowchart TD
    subgraph GitHub["GitHub Actions (.github/workflows/ci-cd.yml)"]
        A["Push / PR to main"] --> B["Job: ci\n(Prettier, TSC, Vitest + Postgres Service)"]
        B -->|Pass & on main| C["Job: cd\n(environment: production)"]
        C -->|Failure| Alert["Send Telegram Alert to Ops Group"]
    end

    subgraph VPS["Production VPS (2.28.234.187)"]
        C -->|SSH as deploy user| D["cd /home/h3nrzi/tele-bot"]
        D --> E["git fetch && git reset --hard origin/main"]
        E --> F["pnpm install --frozen-lockfile\n(Old bot still live)"]
        F --> G["sudo -u h3nrzi pm2 stop voltix-bot\n(Downtime window begins ~3s)"]
        G --> H["pnpm db:migrate\n(Apply Drizzle schema migrations)"]
        H --> I["sudo -u h3nrzi pm2 start ecosystem.config.cjs --env production\n(Downtime window ends)"]
        I --> J["PM2 Health Check\n(Verify online state)"]
    end
```

---

## Server Credentials & Information Reference

| Setting                      | Value / Details              |
| :--------------------------- | :--------------------------- |
| **Server IP**                | `2.28.234.187`               |
| **SSH Port**                 | `22` (default)               |
| **Root User**                | `root`                       |
| **App Owner User**           | `h3nrzi`                     |
| **Dedicated CI/CD User**     | `deploy` (created in Step 4) |
| **Repo Directory**           | `/home/h3nrzi/tele-bot`      |
| **PostgreSQL User**          | `telebot_user`               |
| **PostgreSQL Database**      | `telebot_db`                 |
| **PostgreSQL Test Database** | `tele_bot_test`              |
| **PM2 Process Name**         | `voltix-bot`                 |
| **Telegram Ops Group ID**    | `-5462603831`                |

---

## Step 1: Connect to the Server

Open your terminal and connect to the VPS as `root`:

```bash
ssh root@2.28.234.187
# Enter root password when prompted: jlju9kp0zw3je8ueoxsr
```

---

## Step 2: Install and Verify System Prerequisites

The deployment pipeline requires **Node.js (>=22.13)**, **pnpm (>=11.3.0)**, **PM2**, **tsx**, **Git**, and **PostgreSQL client**.

> [!NOTE]
> `pnpm@11.3.0` requires Node.js >= 22.13 because it uses the built-in `node:sqlite` module. Running it on Node 20 will cause an `ERR_UNKNOWN_BUILTIN_MODULE: No such built-in module: node:sqlite` error.

### 1. Ensure Node.js 22.x & Git are installed:

```bash
# Check existing versions
node -v
git --version

# If Node.js is missing or < 22.13:
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get update && apt-get install -y nodejs git postgresql-client
```

### 2. Install global tools (pnpm, pm2, tsx):

```bash
npm install -g pnpm@11.3.0 pm2 tsx
```

### 3. Ensure global binaries are symlinked to `/usr/bin`:

> [!IMPORTANT]
> Non-interactive SSH sessions and `sudo` use a restricted standard `PATH` (`/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`). Symlinking ensures the commands can be found immediately:

```bash
ln -sf "$(which node)" /usr/bin/node
ln -sf "$(which pnpm)" /usr/bin/pnpm
ln -sf "$(which pm2)" /usr/bin/pm2
ln -sf "$(which tsx)" /usr/bin/tsx
```

---

## Step 3: Verify PostgreSQL Database Connection

Verify that PostgreSQL is active and accepting connections from `telebot_user`:

```bash
# Test local postgres connection using the configured credentials
psql "postgresql://telebot_user:jlju9kp0zw3je8ueoxsr@localhost:5432/telebot_db" -c "SELECT 'Postgres Connected Successfully' AS status;"
```

If it connects and prints `Postgres Connected Successfully`, the database is ready.

---

## Step 4: Verify Repository and `.env` on VPS

Switch to user `h3nrzi` or check `/home/h3nrzi/tele-bot`:

```bash
cd /home/h3nrzi/tele-bot

# Ensure .env is present
ls -la .env
```

### Review `.env` Configuration:

Make sure `/home/h3nrzi/tele-bot/.env` contains the production parameters:

```env
# Telegram Bot Configuration
BOT_TOKEN=8766652761:AAEKdfGMQPOWH7S85d_TvzbQH-Ouyl6nlRM
ADMIN_IDS=1411387735,1965109271

# Database Configuration
DATABASE_URL=postgresql://telebot_user:jlju9kp0zw3je8ueoxsr@localhost:5432/telebot_db
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/tele_bot_test

TOPUP_MIN_USD=1
TOPUP_MAX_USD=200

# Environment
NODE_ENV=production

# Wallex OTC Configuration
WALLEX_API_KEY=20612|eZutBJhevKvoEh96zNbYRQSNy5LzAF6g6aV91EpV
WALLEX_API_BASE_URL=https://api.wallex.ir

TELEGRAM_OPS_GROUP_ID=-5462603831
```

> [!TIP]
> Notice `NODE_ENV` should be set to `production` instead of `development` for production performance and logging behavior.

### Set `.env` File Permissions:

Ensure the file is readable by the `h3nrzi` group (which `deploy` will join), but protected from other users:

```bash
chown h3nrzi:h3nrzi /home/h3nrzi/tele-bot/.env
chmod 640 /home/h3nrzi/tele-bot/.env
```

---

## Step 5: Run the Provisioning Script (`setup-deploy-user.sh`)

As `root`, run the provisioning script from the repository:

```bash
cd /home/h3nrzi/tele-bot
sudo bash scripts/setup-deploy-user.sh
```

### What this script does automatically:

1. **Creates the `deploy` OS user** without password authentication.
2. **Adds `deploy` to group `h3nrzi`** and ensures `/home/h3nrzi` has group-traversal permissions (`chmod g+rx`).
3. **Sets group write permissions** on `/home/h3nrzi/tele-bot` (`chmod -R g+w`).
4. **Configures Git `safe.directory`** so `deploy` can perform `git fetch` and `git reset` on repo files owned by `h3nrzi`.
5. **Configures least-privilege sudoers rule** in `/etc/sudoers.d/deploy-pm2`:
   ```text
   deploy ALL=(h3nrzi) NOPASSWD: /usr/bin/pm2 stop voltix-bot
   deploy ALL=(h3nrzi) NOPASSWD: /usr/bin/pm2 start /home/h3nrzi/tele-bot/ecosystem.config.cjs --env production
   ```
6. **Generates an `ed25519` SSH keypair** in `/home/deploy/.ssh/id_ed25519` and registers the public key in `/home/deploy/.ssh/authorized_keys`.
7. **Prints the private key to the screen**.

> [!IMPORTANT]
> **Keep your terminal open and copy the entire private key block output by the script!**
> It starts with `-----BEGIN OPENSSH PRIVATE KEY-----` and ends with `-----END OPENSSH PRIVATE KEY-----`.

---

## Step 6: Initial Bot Start with PM2

Because the CD pipeline executes `sudo -u h3nrzi pm2 stop voltix-bot` on each deployment, PM2 must know about `voltix-bot` beforehand. Run the initial start as `h3nrzi`:

```bash
# Switch to user h3nrzi
su - h3nrzi

cd /home/h3nrzi/tele-bot

# Install dependencies and apply initial database migrations
pnpm install --frozen-lockfile
pnpm db:migrate

# Start the bot with the committed PM2 ecosystem file
pm2 start ecosystem.config.cjs --env production

# Verify status
pm2 status

# Save the PM2 process list
pm2 save

# Exit back to root
exit
```

### Setup PM2 Systemd Startup (Auto-start on VPS Reboot):

As `root`, configure PM2 to restart processes when the VPS boots:

```bash
# Generate and configure the systemd startup service for h3nrzi
env PATH=$PATH:/usr/bin pm2 startup systemd -u h3nrzi --hp /home/h3nrzi
```

---

## Step 7: Configure GitHub `production` Environment Secrets

All deployment credentials are kept inside a protected GitHub Environment named **`production`**.

1. In your web browser, open your GitHub repository: `https://github.com/h3nrzi/tele-bot`
2. Go to **Settings** → **Environments** (in the left sidebar under _Security_).
3. Click **New environment**.
4. Name: `production` → click **Configure environment**.
5. Scroll down to **Environment secrets** and click **Add secret** for each of the following 7 variables:

| Secret Name             | Exact Value to Enter                                                 |
| :---------------------- | :------------------------------------------------------------------- |
| `SSH_HOST`              | `2.28.234.187`                                                       |
| `SSH_PORT`              | `22`                                                                 |
| `SSH_USER`              | `deploy`                                                             |
| `SSH_PRIVATE_KEY`       | _(Paste the entire `id_ed25519` private key block copied in Step 5)_ |
| `DEPLOY_PATH`           | `/home/h3nrzi/tele-bot`                                              |
| `BOT_TOKEN`             | `8766652761:AAEKdfGMQPOWH7S85d_TvzbQH-Ouyl6nlRM`                     |
| `TELEGRAM_OPS_GROUP_ID` | `-5462603831`                                                        |

> [!NOTE]
> `BOT_TOKEN` and `TELEGRAM_OPS_GROUP_ID` in the GitHub secrets are used exclusively to deliver failure alerts to your Telegram ops group if a deployment fails.

---

## Step 8: Test Deploy User SSH Access Locally

Before pushing to GitHub, you can verify that the `deploy` user can connect using the generated SSH key.

From your local machine (substitute `/path/to/copied_key` with a temporary file with `chmod 600`):

```bash
ssh -i /path/to/copied_key deploy@2.28.234.187 "echo 'SSH Connection OK' && cd /home/h3nrzi/tele-bot && git status"
```

If this succeeds without prompting for a password, your VPS authentication is fully ready!

---

## Step 9: Push Local Commits and Trigger Pipeline

Push your local commits to `main`:

```bash
git push origin main
```

Now open the **Actions** tab on GitHub:

1. The **`ci`** job will run:
   - Sets up Node.js 20 and pnpm
   - Runs `pnpm typecheck`
   - Runs `prettier --check`
   - Boots an ephemeral PostgreSQL service container and runs the full Vitest suite
2. Once `ci` passes, the **`cd`** job runs:
   - Connects to `2.28.234.187` via SSH as `deploy`
   - Fast-forwards the repo: `git fetch && git reset --hard origin/main`
   - Runs `pnpm install --frozen-lockfile`
   - Stops the bot: `sudo -u h3nrzi pm2 stop voltix-bot`
   - Runs database migrations: `pnpm db:migrate`
   - Starts the bot: `sudo -u h3nrzi pm2 start /home/h3nrzi/tele-bot/ecosystem.config.cjs --env production`
   - Runs health verification: checks `pm2 list` for `voltix-bot` in `online` state
   - Deployment registers in the GitHub repository's **production** environment sidebar!

---

## Step 10: Configure GitHub Branch Protection

To prevent anyone from directly pushing broken code to `main` without passing CI:

Follow the detailed instructions in [docs/ops/branch-protection.md](file:///Users/hossein/Projects/tele-bot/docs/ops/branch-protection.md):

- Require a Pull Request before merging
- Require status check `CI` to pass
- **DO NOT** add `CD` as a required status check (CD only runs _after_ merging to `main`)

---

## Troubleshooting & Maintenance

### Check PM2 Bot Logs on VPS

```bash
su - h3nrzi
pm2 logs voltix-bot
```

### Check Process Health & Restarts

```bash
su - h3nrzi
pm2 status voltix-bot
```

### Key Rotation

If you need to rotate the deployment SSH key at any time:

1. Log into VPS as root: `ssh root@2.28.234.187`
2. Run `sudo bash /home/h3nrzi/tele-bot/scripts/setup-deploy-user.sh`
3. Copy the newly generated private key and update `SSH_PRIVATE_KEY` in GitHub `production` environment secrets.
