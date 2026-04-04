from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import ModuleType


def _load_prune_generated_types_module() -> ModuleType:
    repo_root = Path(__file__).resolve().parents[2]
    script_path = repo_root / "backend" / "scripts" / "prune_generated_types.py"
    spec = spec_from_file_location("prune_generated_types_script", script_path)
    assert spec is not None and spec.loader is not None
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_iter_python_files_skips_virtualenvs_with_custom_names(
    tmp_path: Path,
) -> None:
    # gcft/gcf create a built-install venv named ".venv_for_built_setta".
    # The prune script should skip that virtualenv entirely.
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir(parents=True, exist_ok=True)
    first_party_file = workspace_root / "app.py"
    first_party_file.write_text("print('workspace')\n", encoding="utf-8")

    venv_root = workspace_root / ".venv_for_built_setta"
    venv_root.mkdir(parents=True, exist_ok=True)
    (venv_root / "pyvenv.cfg").write_text("home = /tmp\n", encoding="utf-8")
    venv_python_file = venv_root / "lib" / "python3.12" / "site-packages" / "x.py"
    venv_python_file.parent.mkdir(parents=True, exist_ok=True)
    venv_python_file.write_text("print('venv')\n", encoding="utf-8")

    module = _load_prune_generated_types_module()
    files = set(module.iter_python_files(workspace_root))

    assert first_party_file in files
    assert venv_python_file not in files
