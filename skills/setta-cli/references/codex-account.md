# Codex Account

Read account state before starting workflows that need the live Codex provider:

```sh
setta codex account get --json
setta codex account refresh --json
```

Start or cancel login explicitly:

```sh
setta codex login start --type chatgpt --json
setta codex login cancel --login "$LOGIN_ID" --json
```

Log out only when the user requested it:

```sh
setta codex logout --confirm --json
```
