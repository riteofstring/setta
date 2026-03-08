# Remote Install of Built Package

After running `./build.sh`, the deployable artifacts live in `dist/`. That build path now stages the frontend/static bundle and then packages the Python distribution through the shared Go-binary distribution helper. Upload the wheel to the remote server and install it with `uv`.

## Steps

1. Build locally (skip if you already did):

```bash
./build.sh
```

2. Resolve the platform wheel that `./build.sh` produced:

```bash
WHEEL_PATH="$(printf '%s\n' dist/setta-0.0.18-*.whl)"
```

3. Upload the wheel to the remote host:

```bash
scp "${WHEEL_PATH}" paperspace:/tmp/
```

4. Install on the remote server:

```bash
uv pip install --force-reinstall "/tmp/$(basename "${WHEEL_PATH}")"
```

If you prefer a source install, upload `dist/setta-0.0.18.tar.gz` and install that instead.

## Cleanup (remove source files)

If you uploaded or unpacked source artifacts on the remote host, remove them explicitly:

```bash
rm -f "/tmp/$(basename "${WHEEL_PATH}")" /tmp/setta-0.0.18.tar.gz
rm -rf /tmp/setta-0.0.18
```

Wheel installs do not leave a source tree behind. If you also want to remove the installed package itself, run:

```bash
uv pip uninstall setta
rm -rf ~/.cache/uv ~/.cache/pip
```
