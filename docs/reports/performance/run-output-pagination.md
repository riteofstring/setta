# Run Output Pagination Performance

## 2026-05-30 Baseline Before Bounded Output Reads

Scenario: one run item has 1,000 output chunk files and the caller requests the
first page with `limit=50`.

Measurement source: code-derived baseline from the previous store path, which
listed matching output files, decoded all matching JSON payloads, and then
applied the output page cursor and limit.

Results:

- Output chunk metadata entries listed: 1,000
- Output JSON payloads decoded: 1,000
- Output records returned to the caller: 50
- Payload decodes beyond the requested page: 950

## 2026-05-30 After Filename-Bounded Output Reads

Scenario: same 1,000-output run item shape and first page request with
`limit=50`.

Measurement source: production store path covered by
`TestServiceLoadRunItemOutputPageDoesNotReadBeyondLimit`, which corrupts the
third output file and verifies a `limit=2` first page succeeds without reading
the third payload.

Results:

- Output chunk metadata entries listed: 1,000
- Output JSON payloads decoded for the first page: 50
- Output records returned to the caller: 50
- Payload decodes beyond the requested page: 0
- `hasMore` and `nextOrdinal` preserve deterministic access to later pages
