# Designing an Agent-Friendly CLI and Skill.md

## Executive Summary

For large app APIs, the best approach is to design a predictable, self-describing CLI rather than expecting AI agents to memorize every command. Use a consistent nested command structure, provide machine-readable discovery and help, and keep the main `SKILL.md` short by moving detailed references into separate files.

The core principle is:

> Do not make the agent memorize your API. Make the CLI easy to inspect, safe to run, and predictable to automate.

---

## Recommended CLI Structure

Use a Git/Docker/gcloud-style command tree:

```bash
app <domain> <resource> <action> [resource-id] [flags]
```

Examples:

```bash
app users list --org acme --json
app users get usr_123 --json
app users create --from user.json --json
app projects deployments list prj_123 --limit 50 --json
app projects deployments promote dep_456 --to production --dry-run --json
```

For very large APIs, deeper nesting is acceptable:

```bash
app <product-area> <resource-family> <resource> <action>
```

Example:

```bash
app iam service-accounts keys create svc_123 --json
app data pipelines runs logs run_456 --tail 200 --json
```

Keep verbs consistent across the entire CLI. Prefer a small shared verb set such as:

```text
list, get, create, update, delete, enable, disable,
run, cancel, retry, status, logs, diff, plan, apply,
export, import, validate, describe
```

Avoid using different words for the same operation, such as `get`, `fetch`, `retrieve`, `show`, and `inspect`, unless they have clearly different meanings.

---

## Do Not Mirror the Backend API Directly

The CLI should expose common user workflows as first-class commands, not simply reproduce every backend endpoint.

Good CLI commands:

```bash
app users create ...
app deployments promote ...
app reports export ...
```

For rare or advanced use cases, provide a low-level escape hatch:

```bash
app api get /v1/raw/endpoint --json
app api post /v1/raw/endpoint --body request.json --json
```

This keeps the main CLI usable while still allowing full API coverage.

---

## Agent-Friendly CLI Requirements

Every command should support automation-friendly behavior.

Recommended global flags:

```text
--json / --output json          Stable machine-readable output
--no-input / --non-interactive  Never prompt interactively
--dry-run / --plan              Preview side effects
--confirm / --yes               Explicitly approve destructive operations
--limit / --page-token          Support bounded pagination
--fields                        Reduce output size
--idempotency-key               Support safe retries
--timeout                       Avoid hanging commands
--profile / --project / --org   Make scope explicit
--verbose / --quiet             Control diagnostic output
```

Best practices:

- Put successful structured output on `stdout`.
- Put errors, warnings, logs, and diagnostics on `stderr`.
- Use stable exit codes.
- Avoid spinners, prompts, dynamic tables, and interactive flows when automation flags are used.
- Prefer JSON output for anything agents need to parse.
- Require explicit scope for dangerous operations.
- Support `--dry-run` before mutations.

---

## Add Machine-Readable CLI Discovery

For a large API, command discovery is more important than a huge documentation file.

Add commands such as:

```bash
app commands --json
app help users create --json
app schema users create --json
app examples users create --json
app errors --json
app version --json
```

Example `app commands --json` output:

```json
{
  "cli_version": "3.2.0",
  "schema_version": "2026-06-01",
  "commands": [
    {
      "path": "users create",
      "summary": "Create a user",
      "stability": "ga",
      "mutates": true,
      "supports_dry_run": true,
      "supports_json": true
    }
  ]
}
```

Example `app help users create --json` output should include:

```json
{
  "usage": "app users create --from FILE [--org ORG] [--json]",
  "required_flags": ["--from"],
  "optional_flags": ["--org", "--dry-run", "--json", "--no-input"],
  "input_schema": {},
  "output_schema": {},
  "examples": [
    "app users create --from user.json --org acme --dry-run --json"
  ],
  "exit_codes": {
    "0": "success",
    "2": "invalid arguments",
    "4": "authentication failed",
    "5": "permission denied",
    "7": "not found",
    "9": "conflict"
  }
}
```

This lets the skill teach the agent how to inspect the CLI instead of embedding the entire command reference.

---

## Recommended Skill.md Structure

For a large CLI, do not put the whole API reference in one `SKILL.md`.

Use one short main `SKILL.md` plus reference files:

```text
myapp-cli/
  SKILL.md
  references/
    command-index.md
    auth-and-context.md
    users.md
    projects.md
    deployments.md
    billing.md
    errors.md
    output-schemas.md
    dangerous-operations.md
  scripts/
    validate-json-output.py
    smoke-test-cli.sh
  assets/
    examples/
      create-user.json
      deployment-plan.json
```

The main `SKILL.md` should act as a router and operating procedure, not a full manual.

Example structure:

```markdown
---
name: myapp-cli
description: Use this skill when interacting with MyApp through the `myapp` CLI, including managing users, projects, deployments, billing, reports, and API resources.
compatibility: Requires myapp CLI v3.2+, jq, and a non-interactive shell.
---

# MyApp CLI usage

## First steps

1. Check the CLI version:
   `myapp version --json`

2. Discover available commands:
   `myapp commands --json`

3. For command-specific usage, run:
   `myapp help <command-path> --json`

Always prefer `--json` for commands that return data. Use `--no-input` for automation. For mutating or destructive operations, run `--dry-run --json` first unless the user explicitly asked to execute immediately.

## Command areas

- Users and org membership: read `references/users.md`
- Projects and environments: read `references/projects.md`
- Deployments and rollbacks: read `references/deployments.md`
- Billing and invoices: read `references/billing.md`
- Errors and retries: read `references/errors.md`
- Dangerous operations: read `references/dangerous-operations.md`

## Safety rules

- Never use interactive prompts.
- Never parse human tables when `--json` is available.
- Never run destructive commands without explicit scope.
- Prefer idempotent commands and include `--idempotency-key` when available.
- If output is large, request a smaller page with `--limit`, `--fields`, or `--page-token`.
```

---

## Should the Skill Be Split Up?

Yes, but split by coherent job family, not by individual command.

Good skill splits:

```text
myapp-cli-admin
myapp-cli-deployments
myapp-cli-data-import-export
myapp-cli-billing
```

Bad skill splits:

```text
myapp-users-list
myapp-users-get
myapp-users-create
myapp-users-delete
```

Start with one `myapp-cli` skill if the CLI has strong command discovery. Split later only when different areas have distinct workflows, permissions, safety rules, or mental models.

---

## Add an Agent Bootstrap Path

Consider adding:

```bash
app agent init
```

This could generate lightweight project-local guidance such as:

```text
For MyApp tasks, use `myapp commands --json` to discover commands.
Use `myapp help <command> --json` for schemas and examples.
Prefer `--json --no-input`; use `--dry-run` before mutations.
```

This can be written into files such as:

```text
AGENTS.md
CLAUDE.md
.cursor/rules
```

A small always-visible agent guide can help agents discover the correct CLI behavior even before they load a full skill.

---

## Implementation Checklist

### CLI Design

- [ ] Use predictable command nesting: `app <domain> <resource> <action>`.
- [ ] Keep verbs consistent across resources.
- [ ] Avoid mirroring every backend endpoint directly.
- [ ] Provide high-level workflow commands.
- [ ] Provide a low-level `app api ...` escape hatch.

### Agent Safety

- [ ] Support `--json` everywhere data is returned.
- [ ] Support `--no-input` or `--non-interactive`.
- [ ] Support `--dry-run` for mutations.
- [ ] Require explicit confirmation for destructive commands.
- [ ] Use stable exit codes.
- [ ] Separate `stdout` and `stderr` correctly.
- [ ] Support pagination and field selection.
- [ ] Support idempotency keys for retryable mutations.

### Discovery

- [ ] Add `app commands --json`.
- [ ] Add `app help <path> --json`.
- [ ] Add `app schema <path> --json`.
- [ ] Add `app examples <path> --json`.
- [ ] Add `app errors --json`.
- [ ] Add `app version --json`.

### Skill.md

- [ ] Keep the main `SKILL.md` short.
- [ ] Use the main file as a router and operating procedure.
- [ ] Move command details into `references/*.md`.
- [ ] Include safety rules.
- [ ] Tell agents exactly when to load each reference file.
- [ ] Split into multiple skills only when workflows are meaningfully different.

---

## Final Recommendation

Build the system around six layers:

```text
1. CLI command tree
   app <domain> <resource> <action>

2. Machine-readable discovery
   app commands --json
   app help <path> --json
   app schema <path> --json

3. Agent-safe execution
   --json, --no-input, --dry-run, --confirm, pagination, stable exit codes

4. Skill as operating manual
   SKILL.md = quickstart, workflow rules, safety rules, references router

5. References as detailed docs
   references/*.md = command docs by domain

6. Optional low-level escape hatch
   app api get/post/patch/delete ...
```

The best long-term design is a CLI that is self-describing, safely automatable, and consistent enough that agents can discover the correct command at runtime instead of relying on a massive static manual.
