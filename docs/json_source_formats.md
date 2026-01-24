# jsonSource file formats

jsonSource sections can point at files with the following extensions:

- `.json`
- `.yaml` / `.yml`
- `.toml`

## JSON-subset rule

jsonSource files must parse to a JSON object (a top-level dict). The payload must
contain only JSON-compatible types:

- dicts with string keys
- lists
- strings, numbers, booleans, and null

Non-JSON types (for example YAML timestamps or TOML datetimes) are rejected.

## Autosave normalization

Autosave writes jsonSource payloads back to disk using the original file
extension. Key order is preserved based on the in-memory project state so the
frontend ordering stays stable.
