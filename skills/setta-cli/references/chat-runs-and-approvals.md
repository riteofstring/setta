# Chat Runs And Approvals

Send prompts from files or stdin. Use `--prompt-file -` for piped prompts.

```sh
printf '%s\n' "Summarize the current repo." | setta chat send --workspace "$WORKSPACE_ID" --conversation "$CONVERSATION_ID" --prompt-file - --json
```

For streaming, use NDJSON:

```sh
printf '%s\n' "Run the focused tests." | setta chat send --workspace "$WORKSPACE_ID" --conversation "$CONVERSATION_ID" --prompt-file - --wait --ndjson
setta run watch --workspace "$WORKSPACE_ID" --conversation "$CONVERSATION_ID" --run "$RUN_ID" --ndjson
```

Queue and steering commands require an active run:

```sh
setta chat queue --workspace "$WORKSPACE_ID" --conversation "$CONVERSATION_ID" --prompt-file - --json
setta chat steer --workspace "$WORKSPACE_ID" --conversation "$CONVERSATION_ID" --prompt-file - --json
```

Inspect runs with `run active`, `run list`, `run activity`, and `run item-output`. Cancel only with `run cancel --confirm`.

Use approval commands instead of scraping transcript text:

```sh
setta approval list --workspace "$WORKSPACE_ID" --conversation "$CONVERSATION_ID" --json
setta approval submit --workspace "$WORKSPACE_ID" --conversation "$CONVERSATION_ID" --approval "$APPROVAL_ID" --approve --json
setta approval answer --workspace "$WORKSPACE_ID" --conversation "$CONVERSATION_ID" --approval "$APPROVAL_ID" --answers-file answers.json --json
```
