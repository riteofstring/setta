# Skills

This directory is the canonical source for repo-owned agent skills.

Run `scripts/sync_codex_skills.sh` after editing these skills to refresh the
repo-local Codex skill root at `.codex/skills`. Use
`scripts/sync_codex_skills.sh --check` to verify the synced copy has not
drifted.

Use `scripts/sync_codex_skills.sh --install-user` only when you also want to
install the repo-owned skills into `${CODEX_HOME:-$HOME/.codex}/skills` for
local Codex CLI use outside the app.
