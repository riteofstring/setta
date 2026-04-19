import json
import os
import subprocess
from pathlib import Path

from tests.start.dev_script_wiring_helpers import repo_root, write_stub_executable


def _build_report_quality_hotspots_sandbox(tmp_path: Path) -> Path:
    root = repo_root()
    sandbox_root = tmp_path / "report_quality_hotspots_sandbox"
    frontend_src_dir = sandbox_root / "frontend" / "src"
    plugin_frontend_dir = sandbox_root / "plugins" / "demo" / "frontend" / "src"
    plugin_backend_dir = sandbox_root / "plugins" / "demo" / "backend"
    scripts_dir = sandbox_root / "scripts"
    lib_dir = scripts_dir / "lib"
    bin_dir = sandbox_root / "bin"

    frontend_src_dir.mkdir(parents=True, exist_ok=True)
    plugin_frontend_dir.mkdir(parents=True, exist_ok=True)
    plugin_backend_dir.mkdir(parents=True, exist_ok=True)
    lib_dir.mkdir(parents=True, exist_ok=True)
    bin_dir.mkdir(parents=True, exist_ok=True)

    script_dst = sandbox_root / "report_quality_hotspots.sh"
    script_dst.write_text(
        (root / "report_quality_hotspots.sh").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    script_dst.chmod(0o755)
    quality_paths_dst = lib_dir / "quality_paths.sh"
    quality_paths_dst.write_text(
        (root / "scripts" / "lib" / "quality_paths.sh").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    quality_paths_dst.chmod(0o755)

    (sandbox_root / "activate.sh").write_text(
        "#!/usr/bin/env bash\nexport HOTSPOT_SANDBOX=1\n",
        encoding="utf-8",
    )
    (sandbox_root / "activate.sh").chmod(0o755)

    frontend_file = frontend_src_dir / "app.ts"
    plugin_frontend_file = plugin_frontend_dir / "index.ts"
    plugin_python_file = plugin_backend_dir / "main.py"
    plugin_go_file = plugin_backend_dir / "main.go"
    frontend_file.write_text("export const app = true;\n", encoding="utf-8")
    plugin_frontend_file.write_text(
        "export const plugin = true;\n",
        encoding="utf-8",
    )
    plugin_python_file.write_text(
        "def plugin_main() -> None:\n    return None\n",
        encoding="utf-8",
    )
    plugin_go_file.write_text("package main\n\nfunc main() {}\n", encoding="utf-8")

    write_stub_executable(
        bin_dir / "ruff",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" > "{sandbox_root / 'ruff_args.txt'}"
python - <<'PY'
import json
print(json.dumps([
    {{
        "code": "C901",
        "filename": {json.dumps(str(plugin_python_file))},
        "location": {{"row": 1}},
        "message": "`plugin_main` is too complex (12 > 1)",
    }}
]))
PY
""",
    )
    write_stub_executable(
        bin_dir / "pnpm",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" > "{sandbox_root / 'pnpm_args.txt'}"
python - <<'PY'
import json
print(json.dumps([
    {{
        "filePath": {json.dumps(str(frontend_file))},
        "messages": [
            {{"ruleId": "complexity", "line": 1, "message": "Function 'app' has a complexity of 4."}}
        ],
    }},
    {{
        "filePath": {json.dumps(str(plugin_frontend_file))},
        "messages": [
            {{"ruleId": "complexity", "line": 1, "message": "Function 'pluginFrontend' has a complexity of 7."}}
        ],
    }}
]))
PY
""",
    )
    write_stub_executable(
        scripts_dir / "go.sh",
        f"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" > "{sandbox_root / 'go_args.txt'}"
printf '15 demo pluginMain plugins/demo/backend/main.go:1\\n'
""",
    )

    return sandbox_root


def _script_env(sandbox_root: Path) -> dict[str, str]:
    env = os.environ.copy()
    env["PATH"] = f"{sandbox_root / 'bin'}:{env.get('PATH', '')}"
    return env


def test_report_quality_hotspots_uses_shared_plugin_filters(tmp_path: Path) -> None:
    sandbox_root = _build_report_quality_hotspots_sandbox(tmp_path)

    result = subprocess.run(
        [
            "bash",
            str(sandbox_root / "report_quality_hotspots.sh"),
            "--top",
            "10",
            "--python-min",
            "1",
            "--frontend-min",
            "1",
            "--go-min",
            "1",
        ],
        cwd=sandbox_root,
        env=_script_env(sandbox_root),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    assert "demo.pluginMain  plugins/demo/backend/main.go:1" in result.stdout
    assert "plugin_main  plugins/demo/backend/main.py:1" in result.stdout
    assert "pluginFrontend  plugins/demo/frontend/src/index.ts:1" in result.stdout

    assert (sandbox_root / "ruff_args.txt").read_text(encoding="utf-8").strip().endswith(
        "plugins/demo/backend/main.py"
    )
    assert (sandbox_root / "pnpm_args.txt").read_text(encoding="utf-8").strip() == (
        '-C frontend exec eslint --format json --rule complexity:["error",1] -- '
        'src/app.ts ../plugins/demo/frontend/src/index.ts'
    )
    assert (sandbox_root / "go_args.txt").read_text(encoding="utf-8").strip() == (
        "run github.com/fzipp/gocyclo/cmd/gocyclo@v0.6.0 -top 10 plugins/demo/backend/main.go"
    )
