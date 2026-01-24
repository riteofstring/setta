# Setta HTTP API notes

Base API prefix:
- `/api`

OpenAPI schema:
- `/api/openapi.json`

Common routes (Route enum keys):
- `GET_LATEST_PROJECT_STATE`
- `LOAD_ALL_PROJECT_METADATA`
- `RUN_DETACHED`
- `GET_RUN_STATUS`
- `CANCEL_RUN`

Bootstrap endpoints:
- `/__setta__/bootstrap`
- `/__setta__/bootstrap/consume`

Use the OpenAPI schema to confirm request payloads and response shapes.
