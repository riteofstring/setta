# Codex Account

Read account state before starting workflows that need the live Codex provider:

```sh
setta --backend-addr "$ADDR" codex account get --json
setta --backend-addr "$ADDR" codex account refresh --json
```

Start or cancel login explicitly:

```sh
setta --backend-addr "$ADDR" codex login start --type chatgpt --json
setta --backend-addr "$ADDR" codex login cancel --login "$LOGIN_ID" --json
```

Log out only when the user requested it:

```sh
setta --backend-addr "$ADDR" codex logout --confirm --json
```
