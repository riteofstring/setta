# Dependency Audit Guide

This guide is the canonical policy for dependency auditing and remediation in this repo.

## Default workflow

Start with the full visibility pass:

```bash
./audit_supply_chain.sh
```

Normal install scripts must stay frozen:

- `./dev_install.sh`
- `./dev_install_python.sh`

Refresh lockfiles only on purpose:

```bash
./update_dependencies.sh
```

Use `./configure_supply_chain.sh` to update the repo-local or user-level minimum release age policy.

## Remediation policy

- The default remediation target is critical/high findings only unless the developer explicitly asks for broader cleanup.
- Keep dependency fixes minimal and exact. Prefer the smallest official upstream version bump that clears the severe finding.
- Do not churn versions just to clear low/moderate advisories.
- Refresh lockfiles intentionally, then rerun focused tests in the touched area.

## Package-manager-specific guidance

### Python

- `pip-audit` table output does not include severity. Confirm severity from OSV/GHSA metadata before deciding whether a Python finding belongs in a severe-only pass.
- Use pinned direct versions in `pyproject.toml`, then refresh `uv.lock`.
- The repo enforces Python release age from `uv.lock` metadata with `scripts/check_uv_lock_release_age.py`.

### Go

- Prioritize code-reachable `govulncheck` findings.
- Do not bump unrelated modules just because verbose output lists non-reachable advisories.
- Go release-age enforcement is audit-only through `scripts/check_go_module_release_age.py`.

### Frontend / Node / pnpm

- Prefer official upstream releases and narrow `pnpm.overrides` for transitive fixes when the existing upstream range already allows a safe version.
- Avoid broad toolchain churn unless it is required to clear the severe finding.
- Do not switch to obscure forks, republished packages, or unofficial mirrors just to silence an audit finding.
- If the official package has no fixed mainstream release, leave the finding in place, explain the blocker, and present replacement or migration as a separate decision.

## Minimum release age policy

- Every accepted dependency upgrade must satisfy the repo minimum release-age policy.
- Re-run `./audit_supply_chain.sh` after refreshes, or at minimum rerun the Python, Go, and pnpm release-age checks before keeping the lockfile changes.
- `uv` only supports an absolute `--exclude-newer` cutoff, so rolling-age enforcement happens through `scripts/check_uv_lock_release_age.py`.
- pnpm uses `minimum-release-age` in minutes, not `min-release-age` in days.
- Treat pnpm config as resolver guidance only. Hard enforcement for checked-in Node dependencies comes from `scripts/check_pnpm_lock_release_age.py` via `./update_dependencies.sh` and `./audit_supply_chain.sh`.

## When the audit still fails

- If `./audit_supply_chain.sh` still fails only because of intentionally unaddressed lower-severity findings, say that explicitly instead of widening the remediation scope without approval.
- If a remaining severe finding has no acceptable upstream fix, document the blocker and stop there unless the developer explicitly asks for a replacement or migration.
