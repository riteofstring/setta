import importlib.util
import json
import subprocess
from pathlib import Path
from types import ModuleType

import yaml

from tests.start.dev_script_wiring_helpers import repo_root


def _load_aggregate_reports_module() -> ModuleType:
    module_path = repo_root() / "scripts" / "deadcode" / "aggregate_reports.py"
    spec = importlib.util.spec_from_file_location("aggregate_reports", module_path)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_discover_go_main_packages_uses_all_module_packages(
    tmp_path: Path,
    monkeypatch,
) -> None:
    module = _load_aggregate_reports_module()
    monkeypatch.setattr(module, "ROOT_DIR", tmp_path)
    (tmp_path / "cmd" / "setta").mkdir(parents=True)
    (tmp_path / "scripts" / "tool").mkdir(parents=True)

    captured_commands: list[list[str]] = []

    def fake_run_command(command, **_kwargs):
        captured_commands.append(command)
        return subprocess.CompletedProcess(
            command,
            0,
            stdout=(
                f"{tmp_path / 'cmd' / 'setta'}\n\n{tmp_path / 'scripts' / 'tool'}\n"
            ),
            stderr="",
        )

    monkeypatch.setattr(module, "run_command", fake_run_command)

    assert module.discover_go_main_packages() == [
        "./cmd/setta",
        "./scripts/tool",
    ]
    assert captured_commands == [
        [
            str(tmp_path / "scripts" / "go.sh"),
            "list",
            "-f",
            '{{if eq .Name "main"}}{{.Dir}}{{end}}',
            "./...",
        ]
    ]


def test_deadcode_configured_roots_default_and_override() -> None:
    module = _load_aggregate_reports_module()

    assert module.config_string_list(
        {},
        "lint_roots",
        module.DEFAULT_PYTHON_LINT_ROOTS,
    ) == ["backend/setta", "scripts"]
    assert module.config_string_list(
        {"lint_roots": ["backend/setta", "plugins"]},
        "lint_roots",
        module.DEFAULT_PYTHON_LINT_ROOTS,
    ) == ["backend/setta", "plugins"]
    assert module.config_string_list(
        {},
        "test_lint_roots",
        module.python_reports.DEFAULT_PYTHON_TEST_LINT_ROOTS,
    ) == ["tests"]
    assert module.config_string_list(
        {},
        "test_reachability_roots",
        module.python_reports.DEFAULT_PYTHON_TEST_REACHABILITY_ROOTS,
    ) == ["tests"]
    assert module.python_reports.config_command_list(
        {},
        "entrypoint_commands",
        module.python_reports.DEFAULT_PYTHON_ENTRYPOINT_COMMANDS,
    ) == [["-m", "setta", "--help"], ["-m", "setta", "version"]]
    assert module.python_reports.config_command_list(
        {"entrypoint_commands": [["-m", "setta", "plugins", "status"]]},
        "entrypoint_commands",
        module.python_reports.DEFAULT_PYTHON_ENTRYPOINT_COMMANDS,
    ) == [["-m", "setta", "plugins", "status"]]
    assert module.python_reports.DEFAULT_PYTHON_VULTURE_MIN_CONFIDENCE == 60


def test_go_tooling_roots_use_references_instead_of_all_discovered_mains(
    tmp_path: Path,
    monkeypatch,
) -> None:
    module = _load_aggregate_reports_module()
    monkeypatch.setattr(module, "ROOT_DIR", tmp_path)
    monkeypatch.setattr(module.common, "ROOT_DIR", tmp_path)

    (tmp_path / "scripts").mkdir()
    (tmp_path / "scripts" / "generate.sh").write_text(
        "./scripts/go.sh run ./cmd/live-tool\n",
        encoding="utf-8",
    )

    tooling_mains, sources, unclassified_mains, warnings = (
        module.discover_go_tooling_mains(
            go_config={},
            discovered_mains=["./cmd/setta", "./cmd/live-tool", "./cmd/orphan"],
            production_mains=["./cmd/setta"],
        )
    )

    assert tooling_mains == ["./cmd/live-tool"]
    assert sources == {"scripts/generate.sh": ["./cmd/live-tool"]}
    assert unclassified_mains == ["./cmd/orphan"]
    assert warnings == [
        "Discovered Go main packages are not classified as production or tooling roots: ./cmd/orphan"
    ]


def test_go_tooling_reference_discovery_maps_go_files_to_main_package() -> None:
    module = _load_aggregate_reports_module()

    assert module.discover_go_package_references_in_text(
        "./scripts/go.sh run ./scripts/pass_through_constant_aliases/go_candidates.go"
    ) == ["./scripts/pass_through_constant_aliases"]


def test_checked_in_deadcode_config_has_language_entrypoints() -> None:
    config_path = repo_root() / "deadcode.overrides.yaml"
    config = yaml.safe_load(config_path.read_text(encoding="utf-8"))

    assert config["go"]["production_mains"] == ["./cmd/setta", "./cmd/setta-server"]
    assert config["python"]["entrypoint_commands"] == [
        ["-m", "setta", "--help"],
        ["-m", "setta", "version"],
    ]
    assert config["python"]["test_lint_roots"] == ["tests"]
    assert config["python"]["test_reachability_roots"] == ["tests"]
    assert config["python"]["vulture_min_confidence"] == 60
    assert config["frontend"]["app_roots"] == ["frontend/src/index.tsx"]


def test_python_package_roots_are_discovered_from_pyproject(
    tmp_path: Path,
    monkeypatch,
) -> None:
    module = _load_aggregate_reports_module()
    monkeypatch.setattr(module.common, "ROOT_DIR", tmp_path)
    monkeypatch.setattr(module.python_reports, "ROOT_DIR", tmp_path)

    (tmp_path / "backend" / "setta" / "plugin_runtime").mkdir(parents=True)
    (tmp_path / "backend" / "setta" / "__main__.py").write_text("", encoding="utf-8")
    (tmp_path / "backend" / "setta" / "entrypoint.py").write_text("", encoding="utf-8")
    (tmp_path / "backend" / "setta" / "local_core_client.py").write_text(
        "", encoding="utf-8"
    )
    (tmp_path / "backend" / "setta" / "plugin_runtime" / "__init__.py").write_text(
        "", encoding="utf-8"
    )
    (tmp_path / "backend" / "setta" / "plugin_runtime" / "watch_code.py").write_text(
        "", encoding="utf-8"
    )
    (tmp_path / "pyproject.toml").write_text(
        "\n".join(
            [
                "[project.scripts]",
                'setta = "setta.entrypoint:main"',
                "",
                "[tool.hatch.build.targets.wheel]",
                "only-include = [",
                '  "backend/setta/local_core_client.py",',
                '  "backend/setta/plugin_runtime",',
                "]",
                "",
            ]
        ),
        encoding="utf-8",
    )

    modules, warnings = module.python_reports.discover_python_package_import_modules()

    assert modules == [
        "setta.entrypoint",
        "setta",
        "setta.local_core_client",
        "setta.plugin_runtime",
        "setta.plugin_runtime.watch_code",
    ]
    assert warnings == []


def test_python_plugin_backend_entrypoints_are_discovered_from_manifests(
    tmp_path: Path,
    monkeypatch,
) -> None:
    module = _load_aggregate_reports_module()
    monkeypatch.setattr(module.common, "ROOT_DIR", tmp_path)
    monkeypatch.setattr(module.python_reports, "ROOT_DIR", tmp_path)

    plugin_root = tmp_path / "plugins" / "demo"
    (plugin_root / "backend").mkdir(parents=True)
    (plugin_root / "backend" / "main.py").write_text("", encoding="utf-8")
    (plugin_root / "setta.plugin.json").write_text(
        json.dumps({"backend": {"entrypoint": "backend/main.py"}}),
        encoding="utf-8",
    )

    entrypoints, warnings = (
        module.python_reports.discover_python_plugin_backend_entrypoints()
    )

    assert entrypoints == ["plugins/demo/backend/main.py"]
    assert warnings == []


def test_frontend_authoritative_roots_are_discovered(
    tmp_path: Path,
    monkeypatch,
) -> None:
    module = _load_aggregate_reports_module()
    monkeypatch.setattr(module.common, "ROOT_DIR", tmp_path)
    monkeypatch.setattr(module.frontend_reports, "ROOT_DIR", tmp_path)

    (tmp_path / "frontend").mkdir()
    (tmp_path / "frontend" / "index.html").write_text(
        '<script type="module" src="/src/index.tsx"></script>',
        encoding="utf-8",
    )
    (tmp_path / "frontend" / "knip.json").write_text(
        json.dumps({"entry": ["src/index.tsx"]}),
        encoding="utf-8",
    )
    plugin_frontend = tmp_path / "plugins" / "demo" / "frontend"
    plugin_frontend.mkdir(parents=True)
    (plugin_frontend / "package.json").write_text("{}", encoding="utf-8")
    (tmp_path / "plugins" / "demo" / "setta.plugin.json").write_text(
        json.dumps({"frontend": {"entrypoint": "frontend/dist/index.js"}}),
        encoding="utf-8",
    )

    app_roots, warnings = module.frontend_reports.discover_frontend_app_roots()
    package_roots = module.frontend_reports.discover_frontend_plugin_package_roots()

    assert app_roots == ["frontend/src/index.tsx"]
    assert warnings == []
    assert package_roots == ["plugins/demo/frontend"]


def test_deadcode_generated_globs_are_shared_with_quality_paths(
    tmp_path: Path,
    monkeypatch,
) -> None:
    module = _load_aggregate_reports_module()
    monkeypatch.setattr(module, "ROOT_DIR", tmp_path)
    (tmp_path / "quality.paths.yaml").write_text(
        "\n".join(
            [
                "schema_version: 1",
                "python:",
                "  generated_globs:",
                "    - shared/python/**",
                "frontend:",
                "  generated_globs:",
                "    - shared/frontend/**",
                "go:",
                "  generated_globs:",
                "    - shared/go/**",
                "",
            ]
        ),
        encoding="utf-8",
    )

    assert module.resolve_generated_globs(
        "python", {"generated_globs": ["deadcode/python/**"]}, []
    ) == ["shared/python/**", "deadcode/python/**"]
    assert module.resolve_generated_globs(
        "frontend", {"generated_globs": ["deadcode/frontend/**"]}, []
    ) == ["shared/frontend/**", "deadcode/frontend/**"]
    assert module.resolve_generated_globs(
        "go", {"generated_globs": ["deadcode/go/**"]}, ["**/*_gen.go"]
    ) == ["**/*_gen.go", "shared/go/**", "deadcode/go/**"]


def test_python_reachability_includes_configured_script_roots() -> None:
    module = _load_aggregate_reports_module()

    findings = module.python_reports.normalize_python_vulture_findings(
        output=(
            "scripts/deadcode/aggregate_reports.py:10: "
            "unused function 'helper' (90% confidence)"
        ),
        coverage_files={},
        generated_globs=[],
        public_modules=[],
        analyzed_roots=["backend/setta", "scripts"],
    )

    assert len(findings) == 1
    assert findings[0]["path"] == "scripts/deadcode/aggregate_reports.py"
    assert findings[0]["symbol"] == "helper"


def test_python_test_reachability_marks_test_scope() -> None:
    module = _load_aggregate_reports_module()

    findings = module.python_reports.normalize_python_vulture_findings(
        output="tests/api/test_example.py:12: unused function 'helper' (80% confidence)",
        coverage_files={},
        generated_globs=[],
        public_modules=[],
        analyzed_roots=["tests"],
        root_scope="test",
        bucket="test-dead",
    )

    assert len(findings) == 1
    assert findings[0]["root_scope"] == "test"
    assert findings[0]["bucket"] == "test-dead"


def test_relative_path_supports_external_output_directories(
    tmp_path: Path,
    monkeypatch,
) -> None:
    module = _load_aggregate_reports_module()
    repo_dir = tmp_path / "repo"
    external_dir = tmp_path / "external"
    monkeypatch.setattr(module, "ROOT_DIR", repo_dir)

    assert module.relative_path(repo_dir / "reports" / "deadcode.json") == (
        "reports/deadcode.json"
    )
    assert (
        module.relative_path(external_dir / "deadcode.json")
        == (external_dir / "deadcode.json").as_posix()
    )


def test_frontend_package_reports_use_frontend_relative_knip_directories(
    tmp_path: Path,
    monkeypatch,
) -> None:
    module = _load_aggregate_reports_module()
    monkeypatch.setattr(module, "ROOT_DIR", tmp_path)
    package_roots = [
        "frontend/plugin-sdk/app-subsystem",
        "plugins/demo/frontend",
        "plugins/missing/frontend",
    ]
    for package_root in package_roots[:2]:
        package_dir = tmp_path / package_root
        package_dir.mkdir(parents=True)
        (package_dir / "package.json").write_text("{}", encoding="utf-8")

    captured_commands: list[list[str]] = []

    def fake_run_command(command, **_kwargs):
        captured_commands.append(command)
        return subprocess.CompletedProcess(
            command,
            0,
            stdout=(
                '{"files":["src/unused.ts"],'
                '"issues":[{"file":"src/entry.ts",'
                '"exports":[{"name":"unusedExport","line":3,"col":7}]}]}'
            ),
            stderr="",
        )

    monkeypatch.setattr(module, "run_command", fake_run_command)

    report_paths, findings = module.build_frontend_package_reports(
        output_dir=tmp_path / "reports",
        generated_at="2026-04-26T00:00:00+00:00",
        package_roots=package_roots,
        generated_globs=[],
    )

    assert [
        command[command.index("--directory") + 1] for command in captured_commands
    ] == [
        "plugin-sdk/app-subsystem",
        "../plugins/demo/frontend",
    ]
    assert [report["path"] for report in report_paths] == [
        "reports/frontend-plugin-sdk-app-subsystem-deadcode.json",
        "reports/plugins-demo-frontend-deadcode.json",
    ]
    assert {finding["path"] for finding in findings} == {
        "frontend/plugin-sdk/app-subsystem/src/entry.ts",
        "frontend/plugin-sdk/app-subsystem/src/unused.ts",
        "plugins/demo/frontend/src/entry.ts",
        "plugins/demo/frontend/src/unused.ts",
    }


def test_frontend_test_reachability_filters_to_test_paths() -> None:
    module = _load_aggregate_reports_module()

    findings = module.frontend_reports.normalize_knip_findings(
        {
            "files": ["src/unused.ts", "tests/e2e/unused.spec.ts"],
            "issues": [
                {
                    "file": "src/component.ts",
                    "exports": [{"name": "unusedProd", "line": 3, "col": 7}],
                },
                {
                    "file": "tests/e2e/fixture.spec.ts",
                    "exports": [{"name": "unusedTest", "line": 4, "col": 8}],
                },
            ],
        },
        generated_globs=[],
        scope="test",
        issue_label="knip full graph",
        root_prefix="frontend",
        bucket="test-dead",
        root_scope="test",
        only_test_paths=True,
    )

    assert {(finding["path"], finding["symbol"]) for finding in findings} == {
        ("frontend/tests/e2e/fixture.spec.ts", "unusedTest"),
        ("frontend/tests/e2e/unused.spec.ts", None),
    }
    assert {finding["root_scope"] for finding in findings} == {"test"}
