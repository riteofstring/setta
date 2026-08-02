# API conventions

This repository's standard readiness endpoint is `GET /ready`.

It returns status `200`, a JSON content type, and the following body, where the
version is read from `package.json`:

```json
{"ready":true,"version":"<package version>"}
```
