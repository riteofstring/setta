# Setta Workspace Extraction

This branch (`workspace-extraction`) extracts Setta's spatial section workspace into a standalone,
opinionated TypeScript/React package under the working name `@setta/workspace`. It intentionally
contains no Setta application code: the hygiene preflight pruned the branch to a package-focused
skeleton. The frozen reference application lives in the sibling worktree `../setta-main` (`main` at
`043d3b2e9`), and git history preserves everything removed here.

- Plan and process source of truth: `docs/plans/setta-workspace-extraction-plan.md`
- Contributor guidance: `AGENTS.md`
- Target layout: `packages/workspace/` (package), `apps/playground/` (backend-free consumer),
  `scripts/` (package-focused tooling), `docs/evidence/` (accepted reference and parity evidence)

The package stays local and unpublished during this plan. Publishing, licensing, final naming, and
repository structure remain undecided.
