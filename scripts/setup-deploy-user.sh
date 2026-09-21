#!/usr/bin/env bash
# =============================================================================
# setup-deploy-user.sh — VPS least-privilege provisioning wizard
#
# Run once as root on the VPS:
#   sudo bash scripts/setup-deploy-user.sh
#
# Safe to re-run after key rotation (idempotent).
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration — edit these before running if your setup differs
# ---------------------------------------------------------------------------
DEPLOY_USER="deploy"
OWNER_USER="h3nrzi"
# Absolute path to the repo directory on the VPS (same as DEPLOY_PATH secret)
REPO_DIR="/home/${OWNER_USER}/tele-bot"
# Absolute path to the PM2 ecosystem file inside the repo
ECOSYSTEM_PATH="${REPO_DIR}/ecosystem.config.cjs"
PM2_APP_NAME="voltix-bot"

# ---------------------------------------------------------------------------
# Guards
# ---------------------------------------------------------------------------
if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: This script must be run as root (use: sudo bash $0)" >&2
  exit 1
fi

if ! id "${OWNER_USER}" &>/dev/null; then
  echo "ERROR: Owner user '${OWNER_USER}' does not exist on this system." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. Create the deploy OS user (idempotent)
# ---------------------------------------------------------------------------
echo ""
echo "==> [1/5] Ensuring OS user '${DEPLOY_USER}' exists..."

if id "${DEPLOY_USER}" &>/dev/null; then
  echo "    User '${DEPLOY_USER}' already exists — skipping creation."
else
  adduser \
    --disabled-password \
    --gecos "CI/CD deploy account" \
    "${DEPLOY_USER}"
  echo "    User '${DEPLOY_USER}' created."
fi

# ---------------------------------------------------------------------------
# 2. Group membership + repo write access
# ---------------------------------------------------------------------------
echo ""
echo "==> [2/5] Granting '${DEPLOY_USER}' write access to the repo directory..."

# Add deploy user to the owner's primary group
OWNER_GROUP="${OWNER_USER}"
usermod -aG "${OWNER_GROUP}" "${DEPLOY_USER}"
echo "    Added '${DEPLOY_USER}' to group '${OWNER_GROUP}'."

# Ensure owner home directory allows group traversal
chmod g+rx "/home/${OWNER_USER}"
echo "    Ensured group traversal on '/home/${OWNER_USER}'."

# Ensure the repo directory exists and is group-writable
if [[ -d "${REPO_DIR}" ]]; then
  chgrp -R "${OWNER_GROUP}" "${REPO_DIR}"
  chmod -R g+w "${REPO_DIR}"
  echo "    Set g+w on '${REPO_DIR}' (group: ${OWNER_GROUP})."

  # Ensure .env is readable by the group (for migrations and bot runs)
  if [[ -f "${REPO_DIR}/.env" ]]; then
    chmod 640 "${REPO_DIR}/.env"
    echo "    Ensured group read on '${REPO_DIR}/.env'."
  fi
else
  echo "    WARNING: Repo directory '${REPO_DIR}' does not exist yet." \
       "Run this script again after cloning the repo, or set REPO_DIR at the top of the script."
fi

# Ensure git safe.directory is configured so deploy user can run git commands in owner's repo
git config --system --add safe.directory "${REPO_DIR}" 2>/dev/null || true
echo "    Configured git safe.directory for '${REPO_DIR}'."

# ---------------------------------------------------------------------------
# 3. Sudoers rule — PM2 stop/start only
# ---------------------------------------------------------------------------
echo ""
echo "==> [3/5] Writing sudoers rule at /etc/sudoers.d/deploy-pm2..."

# Ensure /usr/bin/pm2 exists if pm2 is in another location (e.g. /usr/local/bin/pm2)
PM2_LOC="$(command -v pm2 || which pm2 || true)"
if [[ -n "${PM2_LOC}" && "${PM2_LOC}" != "/usr/bin/pm2" && ! -e "/usr/bin/pm2" ]]; then
  ln -sf "${PM2_LOC}" /usr/bin/pm2
  echo "    Symlinked ${PM2_LOC} -> /usr/bin/pm2"
fi

# Ensure /home/owner/.pm2 permissions allow group read/write for health checks
OWNER_PM2="/home/${OWNER_USER}/.pm2"
if [[ -d "${OWNER_PM2}" ]]; then
  chgrp -R "${OWNER_GROUP}" "${OWNER_PM2}"
  chmod -R g+rwX "${OWNER_PM2}"
fi

SUDOERS_FILE="/etc/sudoers.d/deploy-pm2"

cat > "${SUDOERS_FILE}" <<EOF
# Managed by setup-deploy-user.sh — do not edit manually.
# Grants '${DEPLOY_USER}' passwordless sudo to run pm2 as '${OWNER_USER}' for exactly two commands.
${DEPLOY_USER} ALL=(${OWNER_USER}) NOPASSWD: /usr/bin/pm2 stop ${PM2_APP_NAME}
${DEPLOY_USER} ALL=(${OWNER_USER}) NOPASSWD: /usr/bin/pm2 start ${ECOSYSTEM_PATH} --env production
EOF

# Lock permissions as required by sudo
chmod 0440 "${SUDOERS_FILE}"

# Validate the file before we leave it in place
if visudo -cf "${SUDOERS_FILE}"; then
  echo "    Sudoers rule written and validated."
else
  echo "ERROR: sudoers validation failed — removing broken file." >&2
  rm -f "${SUDOERS_FILE}"
  exit 1
fi

# ---------------------------------------------------------------------------
# 4. SSH keypair (ed25519) — regenerated on re-run (key rotation)
# ---------------------------------------------------------------------------
echo ""
echo "==> [4/5] Generating ed25519 SSH keypair for '${DEPLOY_USER}'..."

SSH_DIR="/home/${DEPLOY_USER}/.ssh"
PRIVATE_KEY="${SSH_DIR}/id_ed25519"
PUBLIC_KEY="${SSH_DIR}/id_ed25519.pub"
AUTH_KEYS="${SSH_DIR}/authorized_keys"

mkdir -p "${SSH_DIR}"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "${SSH_DIR}"
chmod 700 "${SSH_DIR}"

# Remove old keypair so re-runs rotate the key cleanly
rm -f "${PRIVATE_KEY}" "${PUBLIC_KEY}"

ssh-keygen \
  -t ed25519 \
  -f "${PRIVATE_KEY}" \
  -N "" \
  -C "${DEPLOY_USER}@$(hostname)-$(date +%Y%m%d)"

chown "${DEPLOY_USER}:${DEPLOY_USER}" "${PRIVATE_KEY}" "${PUBLIC_KEY}"
chmod 600 "${PRIVATE_KEY}"
chmod 644 "${PUBLIC_KEY}"

# Register public key in authorized_keys (idempotent via marker lines)
# Create the file atomically with correct ownership if it doesn't exist yet
if [[ ! -f "${AUTH_KEYS}" ]]; then
  install -m 600 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" /dev/null "${AUTH_KEYS}"
fi

# Strip any previous key block written by this script (marker-based dedup)
MARKER_START="# --- managed-by:setup-deploy-user begin ---"
MARKER_END="# --- managed-by:setup-deploy-user end ---"

TMP_AUTH="$(mktemp --tmpdir="${SSH_DIR}")"
awk "/${MARKER_START//\//\\/}/,/${MARKER_END//\//\\/}/{next} 1" "${AUTH_KEYS}" > "${TMP_AUTH}" || true
# Append the new key wrapped in markers so future re-runs can strip it cleanly
{
  cat "${TMP_AUTH}"
  printf '%s\n' "${MARKER_START}"
  cat "${PUBLIC_KEY}"
  printf '%s\n' "${MARKER_END}"
} > "${AUTH_KEYS}"
rm -f "${TMP_AUTH}"

chown "${DEPLOY_USER}:${DEPLOY_USER}" "${AUTH_KEYS}"
chmod 600 "${AUTH_KEYS}"
echo "    Keypair generated and public key added to authorized_keys."

# ---------------------------------------------------------------------------
# 5. Print private key + operator checklist
# ---------------------------------------------------------------------------
echo ""
echo "======================================================================="
echo "  OPERATOR ACTION REQUIRED — copy the private key below into GitHub"
echo "======================================================================="
echo ""
echo "Paste the following block (including the BEGIN/END lines) as the value"
echo "of the GitHub Actions secret  SSH_PRIVATE_KEY  in the 'production'"
echo "environment (Settings → Environments → production → Secrets):"
echo ""
echo "─────────────────────────── PRIVATE KEY START ───────────────────────"
cat "${PRIVATE_KEY}"
echo "────────────────────────────── PRIVATE KEY END ──────────────────────"
echo ""
echo "======================================================================="
echo "  GitHub 'production' environment secrets checklist"
echo "======================================================================="
echo ""
echo "  Set ALL of the following secrets in:"
echo "  GitHub → Settings → Environments → production → Environment secrets"
echo ""
echo "  [ ] SSH_HOST          — Public IP or hostname of the VPS"
echo "  [ ] SSH_PORT          — SSH port (usually 22)"
echo "  [ ] SSH_USER          — ${DEPLOY_USER}"
echo "  [ ] SSH_PRIVATE_KEY   — (pasted above)"
echo "  [ ] DEPLOY_PATH       — ${REPO_DIR}"
echo "  [ ] BOT_TOKEN         — Telegram bot token from @BotFather"
echo "  [ ] TELEGRAM_OPS_GROUP_ID — Telegram group/channel ID for ops alerts"
echo ""
echo "======================================================================="
echo "  Setup complete. The '${DEPLOY_USER}' user is ready."
echo "======================================================================="
echo ""
