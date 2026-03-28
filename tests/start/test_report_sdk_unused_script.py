from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import ModuleType


def _load_report_sdk_unused_module() -> ModuleType:
    repo_root = Path(__file__).resolve().parents[2]
    script_path = repo_root / "backend" / "scripts" / "report_sdk_unused.py"
    spec = spec_from_file_location("report_sdk_unused_script", script_path)
    assert spec is not None and spec.loader is not None
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_analyze_repo_reports_unreachable_modules_and_unused_top_level_defs(
    tmp_path: Path,
) -> None:
    repo_root = tmp_path / "repo"
    api_dir = repo_root / "backend" / "setta" / "api"
    utils_dir = repo_root / "backend" / "setta" / "utils"
    api_dir.mkdir(parents=True, exist_ok=True)
    utils_dir.mkdir(parents=True, exist_ok=True)

    (api_dir / "__init__.py").write_text(
        "from .client import Client\n\n"
        '__all__ = ["Client"]\n',
        encoding="utf-8",
    )
    (api_dir / "client.py").write_text(
        "from setta.utils.helpers import helper\n\n"
        "class Client:\n"
        "    def run(self) -> str:\n"
        "        return helper()\n\n"
        "def _dead_helper() -> str:\n"
        '    return "dead"\n',
        encoding="utf-8",
    )
    (utils_dir / "helpers.py").write_text(
        "def helper() -> str:\n"
        '    return "live"\n',
        encoding="utf-8",
    )
    (utils_dir / "dead.py").write_text(
        "def dead() -> str:\n"
        '    return "dead"\n',
        encoding="utf-8",
    )

    module = _load_report_sdk_unused_module()
    report = module.analyze_repo(
        repo_root=repo_root,
        target_dir=repo_root / "backend" / "setta",
        root_paths=(repo_root / "backend" / "setta" / "api",),
        excluded_dirs=(),
    )

    assert report.unreachable_modules == ["setta.utils.dead"]
    assert [(definition.module, definition.name) for definition in report.unused_top_level] == [
        ("setta.api.client", "_dead_helper")
    ]


def test_root_public_methods_are_treated_as_sdk_surface(
    tmp_path: Path,
) -> None:
    repo_root = tmp_path / "repo"
    api_dir = repo_root / "backend" / "setta" / "api"
    api_dir.mkdir(parents=True, exist_ok=True)

    (api_dir / "__init__.py").write_text("", encoding="utf-8")
    (api_dir / "client.py").write_text(
        "class Client:\n"
        "    def __init__(self) -> None:\n"
        "        self._value = 1\n\n"
        "    def run(self) -> int:\n"
        "        return self._helper()\n\n"
        "    def _helper(self) -> int:\n"
        "        return self._value\n\n"
        "    def _dead(self) -> int:\n"
        "        return 0\n",
        encoding="utf-8",
    )

    module = _load_report_sdk_unused_module()
    report = module.analyze_repo(
        repo_root=repo_root,
        target_dir=repo_root / "backend" / "setta",
        root_paths=(repo_root / "backend" / "setta" / "api",),
        excluded_dirs=(),
    )

    member_names = [
        (member.class_name, member.name) for member in report.potential_unused_members
    ]
    assert ("Client", "run") not in member_names
    assert ("Client", "__init__") not in member_names
    assert ("Client", "_dead") in member_names


def test_member_report_tracks_explicit_self_attribute_reads(
    tmp_path: Path,
) -> None:
    repo_root = tmp_path / "repo"
    api_dir = repo_root / "backend" / "setta" / "api"
    api_dir.mkdir(parents=True, exist_ok=True)

    (api_dir / "__init__.py").write_text("", encoding="utf-8")
    (api_dir / "client.py").write_text(
        "class Client:\n"
        "    used_value = 1\n"
        "    dead_value = 2\n\n"
        "    def run(self) -> int:\n"
        "        return self.used_value\n",
        encoding="utf-8",
    )

    module = _load_report_sdk_unused_module()
    report = module.analyze_repo(
        repo_root=repo_root,
        target_dir=repo_root / "backend" / "setta",
        root_paths=(repo_root / "backend" / "setta" / "api",),
        excluded_dirs=(),
    )

    member_names = [
        (member.class_name, member.name) for member in report.potential_unused_members
    ]
    assert ("Client", "used_value") not in member_names
    assert ("Client", "dead_value") in member_names


def test_excluded_modules_still_contribute_import_edges(
    tmp_path: Path,
) -> None:
    repo_root = tmp_path / "repo"
    api_dir = repo_root / "backend" / "setta" / "api"
    generated_dir = repo_root / "backend" / "setta" / "types" / "generated"
    utils_dir = repo_root / "backend" / "setta" / "utils"
    api_dir.mkdir(parents=True, exist_ok=True)
    generated_dir.mkdir(parents=True, exist_ok=True)
    utils_dir.mkdir(parents=True, exist_ok=True)

    (api_dir / "__init__.py").write_text(
        "from .client import Client\n",
        encoding="utf-8",
    )
    (api_dir / "client.py").write_text(
        "from setta.types.generated.shared import Shared\n\n"
        "class Client:\n"
        "    def build(self) -> Shared:\n"
        "        return Shared()\n",
        encoding="utf-8",
    )
    (generated_dir / "shared.py").write_text(
        "from setta.utils.helpers import helper\n\n"
        "class Shared:\n"
        "    pass\n",
        encoding="utf-8",
    )
    (utils_dir / "helpers.py").write_text(
        "def helper() -> str:\n"
        '    return "live"\n',
        encoding="utf-8",
    )

    module = _load_report_sdk_unused_module()
    report = module.analyze_repo(
        repo_root=repo_root,
        target_dir=repo_root / "backend" / "setta",
        root_paths=(repo_root / "backend" / "setta" / "api",),
        excluded_dirs=(repo_root / "backend" / "setta" / "types" / "generated",),
    )

    assert "setta.utils.helpers" not in report.unreachable_modules


def test_string_module_path_marks_symbol_as_used(
    tmp_path: Path,
) -> None:
    repo_root = tmp_path / "repo"
    api_dir = repo_root / "backend" / "setta" / "api"
    logging_dir = repo_root / "backend" / "setta" / "logging"
    api_dir.mkdir(parents=True, exist_ok=True)
    logging_dir.mkdir(parents=True, exist_ok=True)

    (api_dir / "__init__.py").write_text(
        "from .client import Client\n",
        encoding="utf-8",
    )
    (api_dir / "client.py").write_text(
        "from setta.logging.config import configure\n\n"
        "class Client:\n"
        "    def build(self) -> dict[str, str]:\n"
        "        return configure()\n",
        encoding="utf-8",
    )
    (logging_dir / "config.py").write_text(
        "def configure() -> dict[str, str]:\n"
        '    return {"()": "setta.logging.context.Filter"}\n',
        encoding="utf-8",
    )
    (logging_dir / "context.py").write_text(
        "class Filter:\n"
        "    pass\n",
        encoding="utf-8",
    )

    module = _load_report_sdk_unused_module()
    report = module.analyze_repo(
        repo_root=repo_root,
        target_dir=repo_root / "backend" / "setta",
        root_paths=(repo_root / "backend" / "setta" / "api",),
        excluded_dirs=(),
    )

    assert ("setta.logging.context", "Filter") not in [
        (definition.module, definition.name) for definition in report.unused_top_level
    ]
