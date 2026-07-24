# Claude Code Configuration

## Git push

`origin` is configured over SSH (`git@github.com:...`), but SSH (port 22) is blocked in this
sandbox and `git push` to it will fail with "Connection closed by ... port 22". Don't retry SSH.

Push straight to the HTTPS URL instead — the sandbox proxy injects GitHub credentials for HTTPS
automatically, no `git remote add`/config change needed:

```bash
git push https://github.com/ertrzyiks/ertrzyiks.me.git <branch>:<branch>
```

If it's rejected as non-fast-forward, `origin`'s cached tracking info may be stale. Fetch from the
same HTTPS URL, rebase, then push again:

```bash
git fetch https://github.com/ertrzyiks/ertrzyiks.me.git <branch>
git rebase FETCH_HEAD
git push https://github.com/ertrzyiks/ertrzyiks.me.git <branch>:<branch>
```
