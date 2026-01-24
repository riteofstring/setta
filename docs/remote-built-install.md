# Remote Install of Built Package

After running `./build.sh`, the deployable artifacts live in `dist/`. Upload the wheel to the remote server and install it with `uv`.

## Steps

1. Build locally (skip if you already did):

```bash
./build.sh
```

2. Upload the wheel to the remote host:

```bash
scp dist/setta-0.0.18-py3-none-any.whl paperspace:/tmp/
```

3. Install on the remote server:

```bash
uv pip install --force-reinstall /tmp/setta-0.0.18-py3-none-any.whl
```

If you prefer a source install, upload `dist/setta-0.0.18.tar.gz` and install that instead.

## Cleanup (remove source files)

If you uploaded or unpacked source artifacts on the remote host, remove them explicitly:

```bash
rm -f /tmp/setta-0.0.18-py3-none-any.whl /tmp/setta-0.0.18.tar.gz
rm -rf /tmp/setta-0.0.18
```

Wheel installs do not leave a source tree behind. If you also want to remove the installed package itself, run:

```bash
uv pip uninstall setta
rm -rf ~/.cache/uv ~/.cache/pip
```