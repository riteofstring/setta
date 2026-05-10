# Playwright E2E Runner Notes

Run the Playwright E2E helper from the repo root. The script sources
`./activate.sh` itself, so you do not need to pre-activate the venv in your shell.

## Working command (from repo root)

```
./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/params-section-scroll.spec.ts
```

What this does:
- Sources `./activate.sh` and uses the repo `.venv` Python.
- Always creates a disposable `SETTA_WORKSPACE_ROOT` and seeds temporary `setta_files`.
- Always creates a disposable `SETTA_HOME` so tests never touch your real user config (`~/.setta/config.json`).
- Uses a temp test cache root for plugin fixture/artifact caching (`${TMPDIR:-/tmp}/setta-test-cache/<repo-key>` by default). Override with `SETTA_TEST_CACHE_DIR` when needed.
- Starts backend + frontend on free ports.
- Mints a bootstrap token automatically.
- Runs Playwright with the correct host platform override on Apple Silicon.
- Runs Playwright against the shared Chrome for Testing 149+ binary resolved by
  `scripts/resolve-chrome-for-testing-149.sh`; set `CHROME_BIN` only when you
  intentionally want to override the repo browser.
- Captures backend/frontend logs into a per-run log directory (the script prints `LOG_DIR`). Override via `SETTA_E2E_LOG_DIR` to keep logs somewhere stable; look for `backend.log` and `frontend.log`.

## Common failure modes

- `activate.sh: no such file or directory: .venv/bin/activate`
  - The repo venv is missing. Create it with:
    - `./dev_install.sh`
    - `./init_env.sh`
- `Missing <repo>/.venv/bin/python after sourcing activate.sh.`
  - The repo venv is incomplete or broken. Recreate it with `./dev_install.sh` or `./init_env.sh`.
