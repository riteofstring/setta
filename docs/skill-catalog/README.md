# Skill Catalog

This folder contains Setta-maintained skill documents for distribution and reference.

It is not a runtime skill discovery root for the Setta skills browser.
Runtime discovery uses agent-specific roots (for example `.agents/skills`,
`~/.agents/skills`, `.claude/skills`, `~/.claude/skills`,
`${XDG_CONFIG_HOME:-~/.config}/opencode/skills`, `/etc/codex/skills`) plus
optional `AGENTS_HOME/skills` and `CODEX_HOME/skills` when those env vars are
set.
