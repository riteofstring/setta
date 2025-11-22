. ./init_env.sh && \
./build.sh && \
filepath=$(find dist -type f -name "*.tar.gz") && \
pip install --force-reinstall $filepath && \
python - <<'PY'
from setta.llm.dev_gateway import bundled_gateway_path, has_bundled_gateway

bundled_path = bundled_gateway_path()
required = [
    bundled_path / "package.json",
    bundled_path / "build" / "start-server.js",
]
if not has_bundled_gateway():
    raise SystemExit(f"Missing bundled gateway at {bundled_path}")
for target in required:
    if not target.exists():
        raise SystemExit(f"Bundled gateway asset missing: {target}")
print(f"Bundled gateway verified at {bundled_path}")
PY
&& \
./cleanup.sh
