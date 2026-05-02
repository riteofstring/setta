# Remote Install of Built Wheel

After running `./build.sh`, the deployable artifacts live in `dist/`. That
build path stages the frontend/static bundle and then packages the Python
distribution through the shared Go-binary distribution helper. For packaged-user
installs, upload the built wheel to the remote server and install it with `uv`.

## Steps

1. Build locally (skip if you already did):

```bash
./build.sh
```

2. Resolve the one platform wheel that `./build.sh` produced:

```bash
# shellcheck source=/dev/null
. ./scripts/lib/distribution_artifact_path.sh
WHEEL_PATH="$(setta_resolve_single_dist_artifact "$(pwd)/dist" "*.whl" "wheel")"
```

3. Upload the wheel to the remote host:

```bash
scp "${WHEEL_PATH}" paperspace:/tmp/
```

4. Install on the remote server:

```bash
uv pip install --force-reinstall "/tmp/$(basename "${WHEEL_PATH}")"
```

This page is intentionally wheel-first. If you want to smoke source-package
completeness, use `./verify_install.sh` from the repo checkout instead of
treating `.tar.gz` as the normal remote install path.

## Cleanup

Remove the uploaded wheel explicitly:

```bash
rm -f "/tmp/$(basename "${WHEEL_PATH}")"
```

Wheel installs do not leave a source tree behind. If you also want to remove the
installed package itself, run:

```bash
uv pip uninstall setta
rm -rf ~/.cache/uv ~/.cache/pip
```
