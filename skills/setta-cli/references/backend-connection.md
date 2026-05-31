# Backend Connection

Use an explicit backend address. Do not guess which desktop backend to use.

Start a temporary backend:

```sh
APP_DATA_DIR="$(mktemp -d)"
setta backend start --app-data-dir "$APP_DATA_DIR" --json
```

Use the returned `addr` on later commands:

```sh
setta --backend-addr "$ADDR" health --json
```

Or set the environment variable:

```sh
export SETTA_BACKEND_ADDR="$ADDR"
setta health --json
```

Diagnostics, warnings, progress, and logs belong on stderr. Machine-readable command data belongs on stdout.
