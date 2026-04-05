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


def test_collect_used_keys_treats_direct_generated_import_as_usage(
    tmp_path: Path,
) -> None:
    repo_root = tmp_path / "repo"
    target_dir = repo_root / "backend" / "setta" / "types" / "generated"
    target_dir.mkdir(parents=True, exist_ok=True)
    (target_dir / "go_shared_types.py").write_text(
        "class LLMConfig:\n    pass\n",
        encoding="utf-8",
    )

    wrapper_path = repo_root / "backend" / "setta" / "types" / "llm_config.py"
    wrapper_path.parent.mkdir(parents=True, exist_ok=True)
    wrapper_path.write_text(
        "from setta.types.generated.go_shared_types import LLMConfig\n\n"
        '__all__ = ["LLMConfig"]\n',
        encoding="utf-8",
    )

    module = _load_prune_generated_types_module()
    definitions, module_local_refs = module.collect_definitions(target_dir, repo_root)
    module_to_names = {}
    for definition in definitions:
        module_to_names.setdefault(definition.module, set()).add(definition.name)

    initial_used_keys = {
        definition.key
        for definition in definitions
        if definition.name in module_local_refs.get(definition.module, set())
    }
    used_keys = module.collect_used_keys(
        repo_root,
        module_to_names,
        initial_used_keys=initial_used_keys,
    )

    assert ("setta.types.generated.go_shared_types", "LLMConfig") in used_keys


def test_collect_used_keys_marks_generated_submodule_alias_attribute_usage(
    tmp_path: Path,
) -> None:
    repo_root = tmp_path / "repo"
    target_dir = repo_root / "backend" / "setta" / "types" / "generated"
    target_dir.mkdir(parents=True, exist_ok=True)
    (target_dir / "go_shared_types.py").write_text(
        "class Thing:\n    pass\n",
        encoding="utf-8",
    )

    wrapper_path = repo_root / "backend" / "setta" / "types" / "consumer.py"
    wrapper_path.parent.mkdir(parents=True, exist_ok=True)
    wrapper_path.write_text(
        "from setta.types.generated import go_shared_types as generated_types\n\n"
        "VALUE = generated_types.Thing\n",
        encoding="utf-8",
    )

    module = _load_prune_generated_types_module()
    definitions, module_local_refs = module.collect_definitions(target_dir, repo_root)
    module_to_names = {}
    for definition in definitions:
        module_to_names.setdefault(definition.module, set()).add(definition.name)

    initial_used_keys = {
        definition.key
        for definition in definitions
        if definition.name in module_local_refs.get(definition.module, set())
    }
    used_keys = module.collect_used_keys(
        repo_root,
        module_to_names,
        initial_used_keys=initial_used_keys,
    )

    assert ("setta.types.generated.go_shared_types", "Thing") in used_keys


def test_apply_removals_trims_blank_lines_after_removed_definition(
    tmp_path: Path,
) -> None:
    generated_file = tmp_path / "go_shared_types.py"
    generated_file.write_text(
        "class Keep:\n"
        "    pass\n\n"
        "class Remove:\n"
        "    pass\n\n"
        "VALUE = 1\n",
        encoding="utf-8",
    )

    module = _load_prune_generated_types_module()
    module.apply_removals(
        {
            generated_file: [
                module.Definition(
                    module="setta.types.generated.go_shared_types",
                    name="Remove",
                    path=generated_file,
                    start_line=4,
                    end_line=5,
                    node_type="ClassDef",
                )
            ]
        },
        dry_run=False,
    )

    assert generated_file.read_text(encoding="utf-8") == (
        "class Keep:\n"
        "    pass\n\n"
        "VALUE = 1\n"
    )


def test_apply_removals_dry_run_reports_without_writing(
    tmp_path: Path, capsys
) -> None:
    generated_file = tmp_path / "go_shared_types.py"
    original_content = (
        "class Keep:\n"
        "    pass\n\n"
        "class Remove:\n"
        "    pass\n"
    )
    generated_file.write_text(original_content, encoding="utf-8")

    module = _load_prune_generated_types_module()
    module.apply_removals(
        {
            generated_file: [
                module.Definition(
                    module="setta.types.generated.go_shared_types",
                    name="Remove",
                    path=generated_file,
                    start_line=4,
                    end_line=5,
                    node_type="ClassDef",
                )
            ]
        },
        dry_run=True,
    )

    captured = capsys.readouterr()
    assert "[dry-run]" in captured.out
    assert "would remove 1 definitions" in captured.out
    assert "Remove (lines 4-5)" in captured.out
    assert generated_file.read_text(encoding="utf-8") == original_content


def test_cleanup_unused_imports_removes_stale_generated_imports(
    tmp_path: Path,
) -> None:
    generated_file = tmp_path / "go_shared_types.py"
    generated_file.write_text(
        "from enum import Enum\n"
        "from datetime import datetime\n"
        "from typing import Any\n\n"
        "class Thing:\n"
        "    value: Any\n",
        encoding="utf-8",
    )

    module = _load_prune_generated_types_module()
    cleaned_files = module.cleanup_unused_imports([generated_file], dry_run=False)

    assert cleaned_files == 1
    assert generated_file.read_text(encoding="utf-8") == (
        "from typing import Any\n\n"
        "class Thing:\n"
        "    value: Any\n"
    )


def test_cleanup_unused_imports_preserves_future_annotations_import(
    tmp_path: Path,
) -> None:
    generated_file = tmp_path / "go_shared_types.py"
    generated_file.write_text(
        "from __future__ import annotations\n"
        "from typing import Any\n\n"
        "class Thing:\n"
        '    value: "Later"\n\n'
        "Later = Any\n",
        encoding="utf-8",
    )

    module = _load_prune_generated_types_module()
    cleaned_files = module.cleanup_unused_imports([generated_file], dry_run=False)

    assert cleaned_files == 0
    assert generated_file.read_text(encoding="utf-8") == (
        "from __future__ import annotations\n"
        "from typing import Any\n\n"
        "class Thing:\n"
        '    value: "Later"\n\n'
        "Later = Any\n"
    )


def test_collect_definitions_tracks_top_level_assignments_and_annotations(
    tmp_path: Path,
) -> None:
    repo_root = tmp_path / "repo"
    target_dir = repo_root / "backend" / "setta" / "types" / "generated"
    target_dir.mkdir(parents=True, exist_ok=True)
    generated_path = target_dir / "go_shared_types.py"
    generated_path.write_text(
        "class Client:\n"
        "    pass\n\n"
        "def helper() -> None:\n"
        "    return None\n\n"
        "ANSWER = 42\n"
        "typed_name: str = 'setta'\n",
        encoding="utf-8",
    )

    module = _load_prune_generated_types_module()
    definitions, module_local_refs = module.collect_definitions(target_dir, repo_root)

    assert {
        (definition.module, definition.name, definition.node_type)
        for definition in definitions
    } == {
        ("setta.types.generated.go_shared_types", "Client", "ClassDef"),
        ("setta.types.generated.go_shared_types", "helper", "FunctionDef"),
        ("setta.types.generated.go_shared_types", "ANSWER", "Assign"),
        ("setta.types.generated.go_shared_types", "typed_name", "AnnAssign"),
    }
    assert module_local_refs["setta.types.generated.go_shared_types"] == {"str"}
