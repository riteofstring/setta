# gorilla/securecookie

- Module: `github.com/gorilla/securecookie`
- Local status: planned candidate, not yet pinned in `go.mod`
- Official package page observed on 2026-03-07: `v1.1.2`
- Official package docs: https://pkg.go.dev/github.com/gorilla/securecookie
- Official repo: https://github.com/gorilla/securecookie

## Why It Is A Candidate

- narrow cookie signing and optional encryption layer for auth/bootstrap cookie
  payloads
- intended only as a codec helper under `internal/auth`, not as session
  semantics or auth policy

## API Surface To Use If Adopted

- `securecookie.New`
- `(*SecureCookie).Encode`
- `(*SecureCookie).Decode`
- `securecookie.GenerateRandomKey`

Key-rotation support:

- `securecookie.CodecsFromPairs`
- `securecookie.EncodeMulti`
- `securecookie.DecodeMulti`

## Usage Rules For This Repo

- keep actual auth/session rules custom in repo code
- persist keys outside process lifetime; do not rely on generated keys at boot
- decide serializer explicitly instead of inheriting defaults accidentally
- use the library only for authenticated cookie encoding/decoding

## Relevant Upstream Guidance

- hash key is required and should be strong
- block key is optional; if present, valid AES key lengths are required
- upstream docs explicitly warn that generated keys are not persisted
- key rotation is a first-class documented use case

## Gotchas

- default serialization is `encoding/gob`
- HTTPS is still required; securecookie does not replace transport security
- cookie encryption is optional, but HMAC-only cookies still need careful
  payload design
