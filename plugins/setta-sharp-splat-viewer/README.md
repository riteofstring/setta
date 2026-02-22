# Setta Plugin

## Validate

```bash
setta plugins validate .
```

## Build

```bash
python -m build
```

## Publish

1. Push a git tag (for example `v0.1.0`) to trigger `.github/workflows/release.yml`.
2. Or run manual publish using your package registry credentials.

## Install

```bash
setta plugins install github:OWNER/REPO#v0.1.0
setta plugins install pypi:setta-sharp-splat-viewer==0.1.0
```
