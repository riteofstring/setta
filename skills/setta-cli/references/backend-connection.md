# Backend Connection

If launched from Setta, first confirm the injected connection:

```sh
setta backend connection --json
```

Then run backend-backed commands without `--backend-addr`:

```sh
setta health --json
```

If standalone, open Setta or start a temporary backend:

```sh
APP_DATA_DIR="$(mktemp -d)"
setta backend start --app-data-dir "$APP_DATA_DIR" --json
export SETTA_APP_DATA_DIR="$APP_DATA_DIR"
setta backend connection --json
```

Use explicit address and token flags only for deliberate non-default backends:

```sh
setta --backend-addr "$ADDR" --backend-token "$TOKEN" health --json
```

Diagnostics, warnings, progress, and logs belong on stderr. Machine-readable command data belongs on stdout.
