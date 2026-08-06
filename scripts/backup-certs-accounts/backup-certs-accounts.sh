#!/usr/bin/env bash
#
# backup-certs-accounts.sh
#
# Pulls /certs/accounts from root@ertrzyiks.me over SSH/rsync into timestamped
# snapshots under ~/Backups/ssh-downloads on this Mac. Each snapshot is a
# full, browsable copy of the remote folder at that point in time, but
# unchanged files are hard-linked to the previous snapshot instead of copied
# again — so disk usage only grows with what actually changed (same trick
# Time Machine uses).
#
# Requires: passwordless SSH access to root@ertrzyiks.me (key-based auth,
# e.g. via ssh-agent or an unencrypted key referenced in ~/.ssh/config).
# This script never prompts for a password (BatchMode=yes) so it can run
# unattended; if auth isn't already keyed up, it will fail fast instead of
# hanging on a prompt.
#
# Run this locally on your Mac, not in CI or any sandbox — it needs real SSH
# access to the production host and writes its output to your home directory.
#
# Usage:
#   ./backup-certs-accounts.sh
#
# Exit codes:
#   0  success
#   1  remote path unreachable
#   2  rsync failed
#
set -euo pipefail

REMOTE_HOST="root@ertrzyiks.me"
REMOTE_PATH="/certs/accounts"
SRC="$REMOTE_HOST:$REMOTE_PATH"

DEST_ROOT="$HOME/Backups/ssh-downloads"
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
DEST="$DEST_ROOT/$TIMESTAMP"
LATEST_LINK="$DEST_ROOT/latest"
LOG_DIR="$DEST_ROOT/.logs"
LOG_FILE="$LOG_DIR/$TIMESTAMP.log"

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10)

log() {
  echo "[$(date +%H:%M:%S)] $*"
}

if ! command -v rsync >/dev/null 2>&1; then
  echo "Error: rsync is not installed or not on PATH." >&2
  exit 2
fi

if ! ssh "${SSH_OPTS[@]}" "$REMOTE_HOST" "test -d '$REMOTE_PATH'" 2>/dev/null; then
  echo "Error: cannot reach '$REMOTE_PATH' on $REMOTE_HOST via SSH (check connectivity/auth)." >&2
  exit 1
fi

mkdir -p "$DEST_ROOT" "$LOG_DIR"

# Skip the run entirely if the remote source is empty — with --delete
# below, backing up an empty source would wipe out the new snapshot for
# no reason (the previous snapshot on disk stays untouched either way).
if [[ -z "$(ssh "${SSH_OPTS[@]}" "$REMOTE_HOST" "ls -A '$REMOTE_PATH' 2>/dev/null")" ]]; then
  log "Remote source '$SRC' is empty, nothing to back up."
  exit 0
fi

RSYNC_ARGS=(
  -a               # archive: preserves perms, timestamps, symlinks, etc.
  --delete         # snapshot reflects exactly what's on the remote right now
  --human-readable
  --stats
  -e "ssh ${SSH_OPTS[*]}"
)

# Hard-link against the previous snapshot (if any) so unchanged files
# cost no extra disk space in this snapshot.
if [[ -e "$LATEST_LINK" ]]; then
  RSYNC_ARGS+=(--link-dest="$LATEST_LINK")
fi

log "Backing up '$SRC' -> '$DEST'"
mkdir -p "$DEST"

if rsync "${RSYNC_ARGS[@]}" "$SRC"/ "$DEST"/ | tee "$LOG_FILE"; then
  # Repoint 'latest' at the snapshot we just made, for the next run's
  # --link-dest and for quick access to the newest backup.
  ln -sfn "$DEST" "$LATEST_LINK"
  log "Backup complete: $DEST"
  log "Log saved to: $LOG_FILE"
else
  log "rsync failed — see $LOG_FILE for details"
  exit 2
fi
