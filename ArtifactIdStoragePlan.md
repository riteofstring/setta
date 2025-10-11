# Artifact ID Storage Plan

## Context
- Artifact `id` values (brush strokes, transforms, etc.) are currently bare UUIDs. When normalized on the backend they become flat files at the repository root with no extension.
- Other JSON sources (for example `jsonSource` entries) already use fully qualified paths like `setta_files/.../name.json`. We want artifact ids to follow the same pattern so the path is self-describing and consistent across serializers.
- Users must still be able to reference assets stored outside of `setta_files` (e.g., externally managed images or CSV files), so the system needs to keep accepting arbitrary paths supplied by the user.

## Planned Changes
- Introduce shared helpers on the backend that produce default ids like `setta_files/artifacts/{uuid}{extension}`, picking the correct extension for each artifact type (e.g., `.json`, `.csv`, `.png`).
- Update `BaseArtifact.id` to default to the JSON helper while keeping the ability for callers to pass explicit paths.
- Ensure persistence utilities create parent directories before writing so new default paths do not fail.
- Add a mirror helper on the frontend and teach the schema generator (`convert_pydantic_to_js.py`) to import it with the same alias, keeping the generated TypeScript in sync.
- After regenerating types (`pnpm generate`), brush strokes and transforms created on the client will default to the new path-based ids. Existing ids without directory components continue to resolve correctly via `normalize_path`.
