# VPS setup for GitHub Actions deployment

The production bot, its repository, PM2 process, and GitHub Actions SSH connection all use the same non-root Linux account: `h3nrzi`. This removes the need for a second deploy account and passwordless `sudo` rules.

Never put passwords, bot tokens, database URLs, API keys, or private keys in this document or in Git. Store runtime configuration in `/home/h3nrzi/tele-bot/.env` and deployment credentials in GitHub Environment secrets.

## 1. Provision the host

Connect as root and install the system packages:

```bash
apt-get update
apt-get install -y ca-certificates curl git postgresql-client
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
npm install -g pm2 tsx
```

Create the application account if it does not already exist:

```bash
id h3nrzi >/dev/null 2>&1 || adduser --disabled-password --gecos "Tele Bot" h3nrzi
```

## 2. Grant GitHub Actions SSH access

Generate a dedicated deploy key locally (not on the VPS) and add its public half to `h3nrzi`'s authorized keys:

```bash
ssh-keygen -t ed25519 -f tele-bot-github-actions -C "tele-bot-github-actions" -N ""
ssh-copy-id -i tele-bot-github-actions.pub h3nrzi@YOUR_SERVER_HOST
```

Store the contents of `tele-bot-github-actions` (the private key) in the GitHub `production` environment as `SSH_PRIVATE_KEY`. Do not use the root password or root SSH access in GitHub Actions.

## 3. Install the application

Connect as `h3nrzi`, clone the repository, and create the runtime environment file using real values known only to the operator:

```bash
git clone https://github.com/h3nrzi/tele-bot.git /home/h3nrzi/tele-bot
cd /home/h3nrzi/tele-bot
chmod 700 /home/h3nrzi/tele-bot
umask 077
editor .env
npm ci --omit=dev
npm run db:migrate
pm2 start ecosystem.config.cjs --env production
pm2 save
```

Ensure `/home/h3nrzi/tele-bot/.env` is owned by `h3nrzi` and has mode `600`.

## 4. Enable PM2 after reboot

As root, run the command printed by this command:

```bash
su - h3nrzi -c 'pm2 startup systemd -u h3nrzi --hp /home/h3nrzi'
```

Then run `pm2 save` as `h3nrzi` again if requested by PM2.

## 5. Configure GitHub `production` environment secrets

| Secret | Value |
| --- | --- |
| `SSH_HOST` | VPS host or IP address |
| `SSH_PORT` | SSH port, normally `22` |
| `SSH_USER` | `h3nrzi` |
| `SSH_PRIVATE_KEY` | Private half of the dedicated deploy key |
| `DEPLOY_PATH` | `/home/h3nrzi/tele-bot` |
| `BOT_TOKEN` | Bot token, used only for deployment-failure alerts |
| `TELEGRAM_OPS_GROUP_ID` | Operations chat/group ID |

## Deployment sequence

After CI succeeds on `main`, GitHub Actions connects as `h3nrzi` and runs:

```text
git fetch && git reset --hard origin/main
npm ci --omit=dev
pm2 stop voltix-bot
npm run db:migrate
pm2 start ecosystem.config.cjs --env production
```

No root account, `deploy` account, or `sudo` configuration participates in deployment.
