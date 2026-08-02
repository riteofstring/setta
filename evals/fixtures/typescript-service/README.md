# Setta eval fixture service

This small TypeScript HTTP service is the shared fixture for Setta's live AI
evaluation scenarios.

## Development

Run the service:

```sh
pnpm start
```

The service exposes `GET /`, which returns:

```json
{"service":"setta-eval-fixture"}
```

Run its checks:

```sh
pnpm run build
pnpm test
```
