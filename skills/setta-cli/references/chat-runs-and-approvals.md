# Chat Runs And Approvals

Send prompts from files or stdin. Use `--prompt-file -` for piped prompts.

```sh
printf '%s\n' "Summarize the current repo." | setta --backend-addr "$ADDR" chat send --workspace "$WORKSPACE_ID" --conversation "$CONVERSATION_ID" --prompt-file - --json
```

For streaming, use NDJSON:

```sh
printf '%s\n' "Run the focused tests." | setta --backend-addr "$ADDR" chat send --workspace "$WORKSPACE_ID" --conversation "$CONVERSATION_ID" --prompt-file - --wait --ndjson
setta --backend-addr "$ADDR" run watch --workspace "$WORKSPACE_ID" --conversation "$CONVERSATION_ID" --run "$RUN_ID" --ndjson
```

Queue and steering commands require an active run:

```sh
setta --backend-addr "$ADDR" chat queue --workspace "$WORKSPACE_ID" --conversation "$CONVERSATION_ID" --prompt-file - --json
setta --backend-addr "$ADDR" chat steer --workspace "$WORKSPACE_ID" --conversation "$CONVERSATION_ID" --prompt-file - --json
```

Inspect runs with `run active`, `run list`, `run activity`, and `run item-output`. Cancel only with `run cancel --confirm`.

Use approval commands instead of scraping transcript text:

```sh
setta --backend-addr "$ADDR" approval list --workspace "$WORKSPACE_ID" --conversation "$CONVERSATION_ID" --json
setta --backend-addr "$ADDR" approval submit --workspace "$WORKSPACE_ID" --conversation "$CONVERSATION_ID" --approval "$APPROVAL_ID" --approve --json
setta --backend-addr "$ADDR" approval answer --workspace "$WORKSPACE_ID" --conversation "$CONVERSATION_ID" --approval "$APPROVAL_ID" --answers-file answers.json --json
```
