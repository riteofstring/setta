import os
import subprocess
from pathlib import Path


def test_plugin_fixture_reset_parses_json_from_stdout_without_stderr_noise(
    tmp_path: Path,
) -> None:
    # Fixture reset should parse uninstall JSON from stdout even when stderr prints warnings.
    root = tmp_path / "plugin-reset-sandbox"
    scripts_dir = root / "scripts" / "plugin-fixtures"
    fixtures_dir = root / "tests" / "fixtures" / "plugins" / "fixture-a"
    bin_dir = root / "bin"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    fixtures_dir.mkdir(parents=True, exist_ok=True)
    bin_dir.mkdir(parents=True, exist_ok=True)

    source_reset_script = (
        Path(__file__).resolve().parents[2]
        / "scripts"
        / "plugin-fixtures"
        / "reset.sh"
    )
    reset_script = scripts_dir / "reset.sh"
    reset_script.write_text(source_reset_script.read_text(encoding="utf-8"))
    reset_script.chmod(0o755)

    (root / "activate.sh").write_text(
        "#!/usr/bin/env bash\nexport SETTA_TEST_PLUGIN_FIXTURE_RESET=1\n",
        encoding="utf-8",
    )
    (root / "activate.sh").chmod(0o755)

    (fixtures_dir / "setta.plugin.json").write_text(
        '{"id":"setta-fixture-reset","name":"Fixture","version":"0.1.0","schemaVersion":1}\n',
        encoding="utf-8",
    )

    setta_stub = bin_dir / "setta"
    setta_stub.write_text(
        """#!/usr/bin/env python3
import json
import sys

args = sys.argv[1:]
if len(args) >= 4 and args[0] == "plugins" and args[1] == "uninstall":
    plugin_id = args[2]
    scope = args[args.index("--scope") + 1]
    print(f"warning: simulated noisy stderr for {scope}", file=sys.stderr)
    if scope == "workspace":
        print(f"note: uninstall {plugin_id} in {scope}")
        print(
            json.dumps(
                {
                    "pluginId": plugin_id,
                    "removedFromScope": scope,
                    "restartRequired": False,
                }
            )
        )
        raise SystemExit(0)
    print(f"PLUGIN_NOT_FOUND: plugin {plugin_id} missing in {scope}", file=sys.stderr)
    raise SystemExit(1)
if len(args) >= 2 and args[0] == "plugins" and args[1] == "rescan":
    print("rescanned")
    raise SystemExit(0)
print(f"unexpected args: {args}", file=sys.stderr)
raise SystemExit(1)
""",
        encoding="utf-8",
    )
    setta_stub.chmod(0o755)

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"
    result = subprocess.run(
        ["bash", str(reset_script)],
        cwd=root,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    assert "removed setta-fixture-reset from workspace" in result.stdout
    assert "no setta-fixture-reset entry in setta_files" in result.stdout
    assert "no setta-fixture-reset entry in global" in result.stdout
