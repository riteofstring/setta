# Plugin Authoring Golden Path

This guide is the canonical end-to-end path for building and publishing a Setta plugin.

## 1. Initialize a plugin scaffold

```bash
setta plugins init setta-my-plugin --template full --out .
```

This generates:

- `setta.plugin.json`
- optional `backend/`, `frontend/dist/`, and `content/` scaffolding
- `pyproject.toml` with package metadata aligned to manifest `id` and `version`

## 2. Implement plugin logic

- Backend: edit `backend/entrypoint.py` and expose `register(plugin)`.
- Frontend: edit `frontend/dist/index.js` and export:
  - `apiVersion`
  - `register(host)`
  - optional CSS: `frontend/dist/index.css` and set `frontend.style` in manifest
- Content: add templates/assets under `content/`.

## 3. Link locally during development

```bash
setta plugins link ./setta-my-plugin --scope workspace --force
setta plugins rescan
setta plugins list
setta plugins restart-required
```

If your plugin has backend capabilities, restart Setta when `restart-required`
reports pending backend plugins.

## 4. Validate plugin contract

```bash
setta plugins validate ./setta-my-plugin
```

Validation checks:

- manifest schema and capability vocabulary
- file path safety and existence
- manifest/package metadata identity consistency when package metadata exists

## 5. Build distribution artifacts

```bash
cd setta-my-plugin
python -m build
```

## 6. Publish

Choose at least one source path:

1. GitHub repository release/tag
2. PyPI package publish

## 7. Install in Setta

```bash
setta plugins install github:owner/repo#v0.1.0
setta plugins install pypi:setta-my-plugin==0.1.0
```

Optional scopes:

- `--scope workspace`
- `--scope setta_files`
- `--scope global`

## 8. Verify runtime status

```bash
setta plugins list
setta plugins restart-required
```

Use fixture references in `tests/fixtures/plugins/` for known-good examples (`backend`, `frontend`, `content`, `full`).
