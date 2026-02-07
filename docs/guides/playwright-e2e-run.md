# Playwright E2E Runner Notes

This repo expects the Playwright E2E helper to be run from the repo root with the
Python venv active.

## Working command (from repo root)

```
source activate.sh
scripts/run-playwright-e2e.sh frontend/tests/e2e/params/params-section-scroll.spec.ts
```

What this does:
- Activates the repo's `.venv` so `python` is on PATH.
- Seeds a temporary `setta_files` workspace.
- Starts backend + frontend on free ports.
- Mints a bootstrap token automatically.
- Runs Playwright with the correct host platform override on Apple Silicon.

## Common failure modes

- `python: command not found`
  - The venv is not activated (or does not exist). Run `source activate.sh` from
    the repo root.

- `activate.sh: no such file or directory: .venv/bin/activate`
  - The repo venv is missing. Create it with:
    - `./init_env.sh`
    - `./dev_install.sh`

## Notes from this run

The runner initially failed because it was invoked from the `frontend/` working
folder without `activate.sh`, so `python` was not in PATH. Running from the repo
root with `source activate.sh` fixed it.
