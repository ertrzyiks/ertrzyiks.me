# Backup certs/accounts

Pulls `/certs/accounts` from `root@ertrzyiks.me` (the ACME client's account keys/registration
data on that host) down to a local Mac, so there's an off-server copy of the ACME account
credentials if the host is ever lost or rebuilt.

Run this locally on your Mac, not in CI or any sandbox — it needs real SSH access to the
production host and writes its output to your home directory.

## Requirements

- Passwordless SSH access to `root@ertrzyiks.me` (key-based auth via `ssh-agent`, or a key
  referenced in `~/.ssh/config`). The script uses `BatchMode=yes`, so if auth isn't already keyed
  up it fails fast with a clear error instead of hanging on a password prompt.
- `rsync` (ships with macOS).

## Usage

```bash
./backup-certs-accounts.sh
```

Each run creates a timestamped snapshot under `~/Backups/ssh-downloads/<timestamp>/` and repoints
a `latest` symlink at it. Unchanged files are hard-linked against the previous snapshot (via
`rsync --link-dest`), so disk usage only grows with what actually changed between runs — you get
full history without paying full disk cost every time.

A per-run log is written to `~/Backups/ssh-downloads/.logs/<timestamp>.log`.

## Notes

- These are account **credentials**, not just config — treat `~/Backups/ssh-downloads` on your
  Mac accordingly (it inherits your normal user's file permissions, not root's).
- `rsync -a` preserves ownership/group only when run as root locally; since the script runs as
  your normal Mac user, expect (harmless) ownership-preservation warnings in the log — content and
  permissions still copy correctly.
- Not part of the `apps/*` pnpm workspace and not deployed anywhere; a standalone operational
  script you run by hand when you want a fresh backup.
