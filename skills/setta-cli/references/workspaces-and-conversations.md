# Workspaces And Conversations

Open a workspace with an absolute local path and keep the returned `workspace.id`.

```sh
setta workspace open "$PWD" --json
```

Create a conversation with the workspace ID:

```sh
setta conversation create --workspace "$WORKSPACE_ID" --title "Task" --json
```

List conversations and page messages with explicit IDs:

```sh
setta conversation list --workspace "$WORKSPACE_ID" --json
setta message page --workspace "$WORKSPACE_ID" --conversation "$CONVERSATION_ID" --limit 100 --json
```

Use `workspace session`, `workspace select`, and `workspace close` for active workspace state. Use `workspace recent remove --confirm` only when the user requested removal.
