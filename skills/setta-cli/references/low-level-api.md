# Low-Level API

Prefer workflow commands. Use `setta api ...` only when no workflow command covers the task or when debugging an endpoint contract.

List operations:

```sh
setta api endpoints --json
```

Inspect schemas:

```sh
setta api schema OpenWorkspace --json
```

Call an endpoint with raw JSON:

```sh
setta api call OpenWorkspace --input request.json --json
setta api call ListConversations --input - --json
```

Stream backend events as NDJSON:

```sh
setta api stream EventStream --cursor "$LAST_EVENT_ID" --ndjson
```

Endpoint request and response contracts are owned by the backend registry. Use `api schema` for current shapes instead of memorizing fields.
