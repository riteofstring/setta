# Worktree Dev Quickstart

Create worktrees (from the main repo root):
```sh
./worktree.sh feature-auth-1 fix-realtime-2
```
This creates `../setta.feature-auth-1` and `../setta.fix-realtime-2` on branches
`feature-auth-1` and `fix-realtime-2`,
copies any `.env*` files that exist in the root, then runs `./dev_install.sh` inside each new worktree.

Run a dev instance (from each worktree root):
```sh
./scripts/run-dev-instance.sh
```
The runner uses the worktree folder name for ports and cookie isolation.
Examples: `setta.feature-auth-1` -> backend `8001`, frontend `3001`; `setta.fix-realtime-2` -> `8002`/`3002`.
Use a trailing number if you want predictable port offsets.

Optional overrides:
```sh
./scripts/run-dev-instance.sh --mode startr
SETTA_HOST=localhost SETTA_PORT=8100 SETTA_DEV_FRONTEND_PORT=3100 ./scripts/run-dev-instance.sh
```
