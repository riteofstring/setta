# Worktree Dev Quickstart

Create worktrees (from the main repo root):
```sh
./worktree.sh feature-auth-1 fix-realtime-2
```
This creates `../setta.feature-auth-1` and `../setta.fix-realtime-2` on branches
`feature-auth-1` and `fix-realtime-2`,
copies any `.env*` files that exist in the root, then runs `./dev_install.sh` inside each new worktree.
If you create a single worktree, `./worktree.sh` will enter it by starting a new shell there (exit to return).
If you create multiple worktrees, `./worktree.sh` will stay in the current folder (equivalent to `--stay`).
Use `--stay` to skip entering even for single-worktree runs.

Create worktrees from existing local branches:
```sh
./worktree.sh --existing app-gen-styles
```
In `--existing` mode, each branch must already exist locally in the main repo.

Run a dev instance (from each worktree root):
```sh
./scripts/run-dev-instance.sh
```
The runner uses the worktree folder name for ports and cookie isolation.
Examples: `setta.feature-auth-1` -> backend `8001`, frontend `3001`; `setta.fix-realtime-2` -> `8002`/`3002`.
Use a trailing number if you want predictable port offsets.
Default dev paths are also isolated per worktree:
- `SETTA_HOME=~/.setta-development`
- `SETTA_FILES_ROOT=<worktree>/dev_setta_files`

Optional overrides:
```sh
./scripts/run-dev-instance.sh --mode startr
SETTA_HOST=localhost SETTA_PORT=8100 SETTA_DEV_FRONTEND_PORT=3100 ./scripts/run-dev-instance.sh
```

Runtime profile/path overrides:
```sh
./scripts/run-dev-instance.sh --profile dev
./scripts/run-dev-instance.sh --setta-files-root "$PWD/.setta_state_dev" --runtime-root "$PWD/.setta_runtime_dev"
```

Centralize `setta_files` outside worktrees (global state):

1. Configure global state base in `<setta_home>/config.json` (see `docs/reference/setta-files.md`). For example:
```json
{
  "globalSettaFilesBase": "~/setta_state",
  "autoMode": "create_global"
}
```
2. Ensure the worktree does not already contain a local `setta_files/` folder (local always wins when it exists).
3. Run the instance normally (or force global for that run):
```sh
SETTA_FILES_LOCATION=global ./scripts/run-dev-instance.sh
```
