import ast
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


def test_member_report_propagates_only_from_live_member_dependencies(
    tmp_path: Path,
) -> None:
    repo_root = tmp_path / "repo"
    api_dir = repo_root / "backend" / "setta" / "api"
    utils_dir = repo_root / "backend" / "setta" / "utils"
    api_dir.mkdir(parents=True, exist_ok=True)
    utils_dir.mkdir(parents=True, exist_ok=True)

    (api_dir / "__init__.py").write_text("", encoding="utf-8")
    (api_dir / "client.py").write_text(
        "from setta.utils.constants import C\n\n"
        "class Client:\n"
        "    def run(self) -> int:\n"
        "        return C.LIVE_DERIVED\n",
        encoding="utf-8",
    )
    (utils_dir / "constants.py").write_text(
        "class C:\n"
        "    DEAD_BASE = 1\n"
        "    DEAD_DERIVED = DEAD_BASE + 1\n"
        "    LIVE_BASE = 2\n"
        "    LIVE_DERIVED = LIVE_BASE + 1\n",
        encoding="utf-8",
    )

    module = _load_report_sdk_unused_module()
    report = module.analyze_repo(
        repo_root=repo_root,
        target_dir=repo_root / "backend" / "setta",
        root_paths=(repo_root / "backend" / "setta" / "api",),
        excluded_dirs=(),
    )

    member_names = {
        (member.class_name, member.name) for member in report.potential_unused_members
    }
    assert ("C", "DEAD_BASE") in member_names
    assert ("C", "DEAD_DERIVED") in member_names
    assert ("C", "LIVE_BASE") not in member_names
    assert ("C", "LIVE_DERIVED") not in member_names


def test_member_report_propagates_transitive_member_dependencies(
    tmp_path: Path,
) -> None:
    repo_root = tmp_path / "repo"
    api_dir = repo_root / "backend" / "setta" / "api"
    utils_dir = repo_root / "backend" / "setta" / "utils"
    api_dir.mkdir(parents=True, exist_ok=True)
    utils_dir.mkdir(parents=True, exist_ok=True)

    (api_dir / "__init__.py").write_text("", encoding="utf-8")
    (api_dir / "client.py").write_text(
        "from setta.utils.constants import C\n\n"
        "class Client:\n"
        "    def run(self) -> int:\n"
        "        return C.LIVE_TOP\n",
        encoding="utf-8",
    )
    (utils_dir / "constants.py").write_text(
        "class C:\n"
        "    LIVE_BASE = 2\n"
        "    LIVE_MID = LIVE_BASE + 1\n"
        "    LIVE_TOP = LIVE_MID + 1\n"
        "    DEAD = 0\n",
        encoding="utf-8",
    )

    module = _load_report_sdk_unused_module()
    report = module.analyze_repo(
        repo_root=repo_root,
        target_dir=repo_root / "backend" / "setta",
        root_paths=(repo_root / "backend" / "setta" / "api",),
        excluded_dirs=(),
    )

    member_names = {
        (member.class_name, member.name) for member in report.potential_unused_members
    }
    assert ("C", "LIVE_BASE") not in member_names
    assert ("C", "LIVE_MID") not in member_names
    assert ("C", "LIVE_TOP") not in member_names
    assert ("C", "DEAD") in member_names


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


def test_extract_exported_names_accepts_annotated_all_assignment() -> None:
    module = _load_report_sdk_unused_module()
    node = ast.parse(
        '__all__: tuple[str, ...] = ["Client", "Runner", 3]\n'
    ).body[0]

    assert module.extract_exported_names(node) == {"Client", "Runner"}


def test_iter_python_files_skips_cache_dirs_and_virtualenvs(tmp_path: Path) -> None:
    module = _load_report_sdk_unused_module()
    root = tmp_path / "backend" / "setta"
    (root / "api").mkdir(parents=True, exist_ok=True)
    (root / ".git").mkdir(parents=True, exist_ok=True)
    (root / "__pycache__").mkdir(parents=True, exist_ok=True)
    (root / "venv" / "pkg").mkdir(parents=True, exist_ok=True)
    (root / "keep").mkdir(parents=True, exist_ok=True)

    (root / "api" / "client.py").write_text("x = 1\n", encoding="utf-8")
    (root / ".git" / "ignored.py").write_text("x = 1\n", encoding="utf-8")
    (root / "__pycache__" / "ignored.py").write_text("x = 1\n", encoding="utf-8")
    (root / "venv" / "pyvenv.cfg").write_text("home = /tmp\n", encoding="utf-8")
    (root / "venv" / "pkg" / "ignored.py").write_text("x = 1\n", encoding="utf-8")
    (root / "keep" / "live.py").write_text("x = 1\n", encoding="utf-8")

    paths = sorted(path.relative_to(root) for path in module.iter_python_files(root))

    assert paths == [Path("api/client.py"), Path("keep/live.py")]


def test_import_from_records_star_submodule_and_symbol_bindings() -> None:
    module = _load_report_sdk_unused_module()
    collector = module.ModuleImportCollector(
        current_module="setta.api.client",
        current_is_package=False,
        known_modules={"setta.pkg", "setta.pkg.helpers"},
    )

    collector.visit(
        ast.parse(
            "from setta.pkg import helpers as helpers_mod, symbol as alias\n"
            "from setta.pkg import *\n"
        )
    )

    assert collector.imported_modules == {"setta.pkg", "setta.pkg.helpers"}
    assert [
        (
            binding.local_name,
            binding.target_module,
            binding.target_name,
            binding.kind,
        )
        for binding in collector.import_bindings
    ] == [
        ("helpers_mod", "setta.pkg.helpers", None, "module"),
        ("alias", "setta.pkg", "symbol", "symbol"),
    ]


def test_attribute_usage_marks_module_symbol_and_local_class_targets(
    tmp_path: Path,
) -> None:
    repo_root = tmp_path / "repo"
    api_dir = repo_root / "backend" / "setta" / "api"
    utils_dir = repo_root / "backend" / "setta" / "utils"
    api_dir.mkdir(parents=True, exist_ok=True)
    utils_dir.mkdir(parents=True, exist_ok=True)

    (api_dir / "__init__.py").write_text("", encoding="utf-8")
    (api_dir / "client.py").write_text(
        "from setta.utils import helpers\n"
        "from setta.utils.constants import Config\n\n"
        "class Local:\n"
        "    VALUE = 3\n\n"
        "class Client:\n"
        "    def run(self) -> int:\n"
        "        return helpers.live() + Config.LIVE + Local.VALUE\n",
        encoding="utf-8",
    )
    (utils_dir / "__init__.py").write_text("", encoding="utf-8")
    (utils_dir / "helpers.py").write_text(
        "def live() -> int:\n"
        "    return 1\n\n"
        "def dead() -> int:\n"
        "    return 0\n",
        encoding="utf-8",
    )
    (utils_dir / "constants.py").write_text(
        "class Config:\n"
        "    LIVE = 1\n"
        "    DEAD = 0\n",
        encoding="utf-8",
    )

    module = _load_report_sdk_unused_module()
    report = module.analyze_repo(
        repo_root=repo_root,
        target_dir=repo_root / "backend" / "setta",
        root_paths=(repo_root / "backend" / "setta" / "api",),
        excluded_dirs=(),
    )

    unused_top_level = {
        (definition.module, definition.name) for definition in report.unused_top_level
    }
    member_names = {
        (member.class_name, member.name) for member in report.potential_unused_members
    }

    assert ("setta.utils.helpers", "live") not in unused_top_level
    assert ("setta.utils.helpers", "dead") in unused_top_level
    assert ("Config", "LIVE") not in member_names
    assert ("Config", "DEAD") in member_names
    assert ("Local", "VALUE") not in member_names


def test_render_text_report_formats_structured_sections() -> None:
    module = _load_report_sdk_unused_module()
    report = module.AnalysisReport(
        reachable_modules=["setta.api"],
        unreachable_modules=["setta.utils.dead"],
        unused_top_level=[
            module.TopLevelDefinition(
                module="setta.api.client",
                name="_dead_helper",
                kind="function",
                path=Path("backend/setta/api/client.py"),
                start_line=9,
                end_line=10,
            )
        ],
        potential_unused_members=[
            module.ClassMemberDefinition(
                module="setta.api.client",
                class_name="Client",
                name="_dead",
                kind="method",
                path=Path("backend/setta/api/client.py"),
                start_line=14,
                end_line=15,
            )
        ],
    )

    assert module.render_text_report(report) == (
        "SDK unused-code report\n"
        "\n"
        "Reachable modules: 1\n"
        "Unreachable modules: 1\n"
        "Unused top-level definitions: 1\n"
        "Potentially unused class members: 1\n"
        "\n"
        "High confidence: unreachable modules\n"
        "  - setta.utils.dead\n"
        "\n"
        "High confidence: unused top-level definitions\n"
        "  - setta.api.client._dead_helper [function] (backend/setta/api/client.py:9)\n"
        "\n"
        "Lower confidence: potentially unused class members\n"
        "  - setta.api.client.Client._dead [method] (backend/setta/api/client.py:14)\n"
    )


def test_render_report_section_formats_empty_sections() -> None:
    module = _load_report_sdk_unused_module()

    assert module.render_report_section(
        title="Example",
        items=[],
        formatter=str,
    ) == ["", "Example", "  (none)"]
