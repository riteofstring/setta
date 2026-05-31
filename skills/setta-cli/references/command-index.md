# Setta CLI Command Index

Generated from the Setta CLI command registry. Use `setta help <command-path> --json` and `setta schema <command-path> --json` for current details.

## agent guide

Print a concise Setta CLI bootstrap guide for agent instruction files.

- Usage: `setta agent guide --format markdown`
- Requires backend: `false`
- Mutates state: `false`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## agent skill export

Export the Setta CLI skill package.

- Usage: `setta agent skill export --output DIR`
- Requires backend: `false`
- Mutates state: `true`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## api call

Call a backend operation with a raw JSON request body.

- Usage: `setta api call OPERATION --input request.json --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## api endpoints

List backend endpoint operations derived from the Go endpoint registry.

- Usage: `setta api endpoints --json`
- Requires backend: `false`
- Mutates state: `false`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## api schema

Print request and response JSON Schemas for a backend operation.

- Usage: `setta api schema OPERATION --json`
- Requires backend: `false`
- Mutates state: `false`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## api stream

Stream a backend streaming operation as newline-delimited JSON.

- Usage: `setta api stream EventStream --cursor STREAM:SEQUENCE --ndjson`
- Requires backend: `true`
- Mutates state: `false`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `true`

## approval answer

Answer a structured or user-input approval.

- Usage: `setta approval answer --workspace WORKSPACE_ID --conversation CONVERSATION_ID --approval APPROVAL_ID --answers-file answers.json --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## approval cancel

Cancel a pending approval.

- Usage: `setta approval cancel --workspace WORKSPACE_ID --conversation CONVERSATION_ID --approval APPROVAL_ID --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## approval list

List pending approvals for a conversation.

- Usage: `setta approval list --workspace WORKSPACE_ID --conversation CONVERSATION_ID --json`
- Requires backend: `true`
- Mutates state: `false`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## approval submit

Approve or deny a pending approval.

- Usage: `setta approval submit --workspace WORKSPACE_ID --conversation CONVERSATION_ID --approval APPROVAL_ID --approve --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## backend connection

Print the resolved backend connection metadata.

- Usage: `setta backend connection --json`
- Requires backend: `false`
- Mutates state: `false`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## backend start

Start a Setta backend with explicit app data.

- Usage: `setta backend start --app-data-dir DIR --json`
- Requires backend: `false`
- Mutates state: `true`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## backend status

Read backend status from the configured backend connection.

- Usage: `setta backend status [--json]`
- Requires backend: `true`
- Mutates state: `false`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## chat command execute

Execute a raw chat slash command.

- Usage: `setta chat command execute --workspace WORKSPACE_ID --conversation CONVERSATION_ID --raw "/goal ..." --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## chat command list

List chat slash commands available for a conversation.

- Usage: `setta chat command list --workspace WORKSPACE_ID --conversation CONVERSATION_ID --json`
- Requires backend: `true`
- Mutates state: `false`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## chat model set

Set a conversation Codex model.

- Usage: `setta chat model set --workspace WORKSPACE_ID --conversation CONVERSATION_ID --model MODEL_ID --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## chat queue

Queue a user prompt behind an active run.

- Usage: `setta chat queue --workspace WORKSPACE_ID --conversation CONVERSATION_ID --prompt-file - --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## chat queue edit

Edit a queued prompt.

- Usage: `setta chat queue edit --workspace WORKSPACE_ID --conversation CONVERSATION_ID --message MESSAGE_ID --prompt-file - --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## chat queue remove

Remove a queued prompt.

- Usage: `setta chat queue remove --workspace WORKSPACE_ID --conversation CONVERSATION_ID --message MESSAGE_ID --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## chat reasoning-effort set

Set a conversation Codex reasoning effort.

- Usage: `setta chat reasoning-effort set --workspace WORKSPACE_ID --conversation CONVERSATION_ID --effort high --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## chat send

Send a user prompt to a conversation.

- Usage: `setta chat send --workspace WORKSPACE_ID --conversation CONVERSATION_ID --prompt-file - --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `true`

## chat steer

Send steering text to an active run.

- Usage: `setta chat steer --workspace WORKSPACE_ID --conversation CONVERSATION_ID --prompt-file - --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## chat steer-immediate

Cancel the active run and immediately replay pending steering.

- Usage: `setta chat steer-immediate --workspace WORKSPACE_ID --conversation CONVERSATION_ID --prompt-file - --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## codex account get

Read Codex account state.

- Usage: `setta codex account get --json`
- Requires backend: `true`
- Mutates state: `false`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## codex account refresh

Refresh Codex account state.

- Usage: `setta codex account refresh --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## codex login cancel

Cancel Codex login.

- Usage: `setta codex login cancel --login LOGIN_ID --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## codex login start

Start Codex login.

- Usage: `setta codex login start --type chatgpt --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## codex logout

Log out of Codex.

- Usage: `setta codex logout --confirm --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `true`
- JSON: `true`
- NDJSON: `false`

## commands

List CLI commands and machine-readable command metadata.

- Usage: `setta commands [--json]`
- Requires backend: `false`
- Mutates state: `false`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## conversation create

Create a conversation in a workspace.

- Usage: `setta conversation create --workspace WORKSPACE_ID --title TITLE --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## conversation list

List conversations for a workspace.

- Usage: `setta conversation list --workspace WORKSPACE_ID --json`
- Requires backend: `true`
- Mutates state: `false`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## conversation mark-read

Advance a conversation read marker.

- Usage: `setta conversation mark-read --workspace WORKSPACE_ID --conversation CONVERSATION_ID --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## errors

List CLI exit code classes.

- Usage: `setta errors [--json]`
- Requires backend: `false`
- Mutates state: `false`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## health

Read backend health through the configured backend connection.

- Usage: `setta health [--json]`
- Requires backend: `true`
- Mutates state: `false`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## help

Describe a command path.

- Usage: `setta help <command-path> [--json]`
- Requires backend: `false`
- Mutates state: `false`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## message page

Read a bounded page of conversation messages.

- Usage: `setta message page --workspace WORKSPACE_ID --conversation CONVERSATION_ID --limit 100 --json`
- Requires backend: `true`
- Mutates state: `false`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## run active

Read the active run for a conversation.

- Usage: `setta run active --workspace WORKSPACE_ID --conversation CONVERSATION_ID --json`
- Requires backend: `true`
- Mutates state: `false`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## run activity

Read bounded run activity.

- Usage: `setta run activity --workspace WORKSPACE_ID --run RUN_ID --limit 200 --json`
- Requires backend: `true`
- Mutates state: `false`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## run cancel

Cancel the active run for a conversation.

- Usage: `setta run cancel --workspace WORKSPACE_ID --conversation CONVERSATION_ID --confirm --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `true`
- JSON: `true`
- NDJSON: `false`

## run item-output

Read bounded output for a run item.

- Usage: `setta run item-output --workspace WORKSPACE_ID --run RUN_ID --item RUN_ITEM_ID --after 0 --limit 200 --json`
- Requires backend: `true`
- Mutates state: `false`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## run list

List runs for a conversation.

- Usage: `setta run list --workspace WORKSPACE_ID --conversation CONVERSATION_ID --json`
- Requires backend: `true`
- Mutates state: `false`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## run watch

Watch backend events for a run as newline-delimited JSON.

- Usage: `setta run watch --workspace WORKSPACE_ID --conversation CONVERSATION_ID --run RUN_ID --ndjson`
- Requires backend: `true`
- Mutates state: `false`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `true`

## schema

Print input and output JSON Schemas for a command path.

- Usage: `setta schema <command-path> [--json]`
- Requires backend: `false`
- Mutates state: `false`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## version

Print CLI version metadata.

- Usage: `setta version [--json]`
- Requires backend: `false`
- Mutates state: `false`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## workspace close

Close an active workspace.

- Usage: `setta workspace close WORKSPACE_ID --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## workspace open

Open a local workspace path.

- Usage: `setta workspace open PATH --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## workspace recent remove

Remove a recent workspace entry.

- Usage: `setta workspace recent remove WORKSPACE_ID --confirm --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `true`
- JSON: `true`
- NDJSON: `false`

## workspace reorder

Reorder active workspaces from a JSON array of workspace IDs.

- Usage: `setta workspace reorder --ids-file ids.json --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## workspace select

Select an active workspace.

- Usage: `setta workspace select WORKSPACE_ID --json`
- Requires backend: `true`
- Mutates state: `true`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

## workspace session

Read the current workspace session.

- Usage: `setta workspace session --json`
- Requires backend: `true`
- Mutates state: `false`
- Dangerous: `false`
- JSON: `true`
- NDJSON: `false`

