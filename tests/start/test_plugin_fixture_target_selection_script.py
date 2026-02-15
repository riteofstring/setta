import shlex
import subprocess
from pathlib import Path

from tests.start.dev_script_wiring_helpers import repo_root


def _build_fixture_target_sandbox(tmp_path: Path) -> Path:
    root = tmp_path / "fixture_target_selection"
    cache_script_dst = root / "scripts" / "plugin-fixtures" / "cache.sh"
    cache_script_dst.parent.mkdir(parents=True, exist_ok=True)
    cache_script_src = repo_root() / "scripts" / "plugin-fixtures" / "cache.sh"
    cache_script_dst.write_text(cache_script_src.read_text(encoding="utf-8"))
    cache_script_dst.chmod(0o755)

    (root / "frontend" / "tests" / "e2e" / "overview").mkdir(
        parents=True, exist_ok=True
    )
    (root / "frontend" / "tests" / "e2e" / "editor").mkdir(
        parents=True, exist_ok=True
    )
    (root / "tests" / "project_state").mkdir(parents=True, exist_ok=True)
    (root / "tests" / "plugins").mkdir(parents=True, exist_ok=True)
    (root / "tests" / "start").mkdir(parents=True, exist_ok=True)
    (root / "tests" / "fixtures" / "plugins" / "fixture-a" / "frontend" / "dist").mkdir(
        parents=True,
        exist_ok=True,
    )
    (root / "frontend" / "tests" / "e2e" / "overview" / "plugin-pane.spec.ts").write_text(
        "import { test } from '@playwright/test';\n",
        encoding="utf-8",
    )
    (root / "frontend" / "tests" / "e2e" / "overview" / "workspace-switcher.spec.ts").write_text(
        "import { test } from '@playwright/test';\n",
        encoding="utf-8",
    )
    (root / "frontend" / "tests" / "e2e" / "editor" / "section-style-colors.spec.ts").write_text(
        "import { test } from '@playwright/test';\n",
        encoding="utf-8",
    )
    (root / "tests" / "project_state" / "test_project_config_view_modes.py").write_text(
        "def test_project_config_view_modes() -> None:\n    assert True\n",
        encoding="utf-8",
    )
    (root / "tests" / "start" / "test_start_plugins.py").write_text(
        "def test_start_plugins() -> None:\n    assert True\n",
        encoding="utf-8",
    )
    (root / "tests" / "test_nonplugin_runner.py").write_text(
        "def test_nonplugin_runner() -> None:\n    assert True\n",
        encoding="utf-8",
    )
    (root / "tests" / "plugins" / "test_plugin_runtime.py").write_text(
        "def test_plugin_runtime() -> None:\n    assert True\n",
        encoding="utf-8",
    )
    (root / "tests" / "fixtures" / "plugins" / "fixture-a" / "setta.plugin.json").write_text(
        (
            '{"id":"fixture-a","name":"Fixture A","frontend":'
            '{"entrypoint":"frontend/dist/index.js","style":"frontend/dist/index.css"}}'
        ),
        encoding="utf-8",
    )
    (
        root
        / "tests"
        / "fixtures"
        / "plugins"
        / "fixture-a"
        / "frontend"
        / "dist"
        / "index.js"
    ).write_text(
        "export const fixture = true;\n",
        encoding="utf-8",
    )
    (
        root
        / "tests"
        / "fixtures"
        / "plugins"
        / "fixture-a"
        / "frontend"
        / "dist"
        / "index.css"
    ).write_text(
        ".fixture { color: red; }\n",
        encoding="utf-8",
    )

    return root


def _should_build_for_targets(root: Path, mode: str, args: list[str]) -> bool:
    joined_args = " ".join(shlex.quote(arg) for arg in args)
    command = (
        f". {shlex.quote(str(root / 'scripts' / 'plugin-fixtures' / 'cache.sh'))} && "
        "if should_build_plugin_fixtures_for_targets "
        f"{shlex.quote(str(root))} {shlex.quote(mode)} {joined_args}; then "
        "echo 1; else echo 0; fi"
    )
    result = subprocess.run(
        ["bash", "-lc", command],
        cwd=root,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    return result.stdout.strip() == "1"


def test_playwright_fixture_selection_builds_for_overview_directory_with_plugin_specs(
    tmp_path: Path,
) -> None:
    # Directory targets should trigger fixture prep when selected specs include plugin tests.
    sandbox_root = _build_fixture_target_sandbox(tmp_path)

    assert _should_build_for_targets(
        sandbox_root,
        "playwright",
        ["frontend/tests/e2e/overview"],
    )


def test_playwright_fixture_selection_skips_for_non_plugin_directory_targets(
    tmp_path: Path,
) -> None:
    # Non-plugin directory targets should avoid fixture prep to keep targeted runs fast.
    sandbox_root = _build_fixture_target_sandbox(tmp_path)

    assert not _should_build_for_targets(
        sandbox_root,
        "playwright",
        ["frontend/tests/e2e/editor"],
    )


def test_playwright_fixture_selection_honors_plugin_grep_selector(
    tmp_path: Path,
) -> None:
    # Explicit plugin grep selectors should trigger fixture prep even without positional targets.
    sandbox_root = _build_fixture_target_sandbox(tmp_path)

    assert _should_build_for_targets(
        sandbox_root,
        "playwright",
        ["--grep", "plugin pane flow"],
    )


def test_playwright_fixture_selection_honors_plugin_grep_selector_case_insensitive(
    tmp_path: Path,
) -> None:
    # Grep selectors should detect plugin intent regardless of case.
    sandbox_root = _build_fixture_target_sandbox(tmp_path)

    assert _should_build_for_targets(
        sandbox_root,
        "playwright",
        ["--grep", "Plugin Pane Flow"],
    )


def test_playwright_fixture_selection_detects_case_insensitive_plugin_path_hints(
    tmp_path: Path,
) -> None:
    # Path-based plugin hints should be matched case-insensitively.
    sandbox_root = _build_fixture_target_sandbox(tmp_path)

    assert _should_build_for_targets(
        sandbox_root,
        "playwright",
        ["frontend/tests/e2e/overview/PLUGIN-PANE.spec.ts"],
    )


def test_playwright_fixture_selection_skips_selector_only_runs_without_plugin_hints(
    tmp_path: Path,
) -> None:
    # Selector-only Playwright runs without plugin hints should skip fixture prep.
    sandbox_root = _build_fixture_target_sandbox(tmp_path)

    assert not _should_build_for_targets(
        sandbox_root,
        "playwright",
        ["--grep", "workspace"],
    )


def test_playwright_fixture_selection_skips_for_non_plugin_grep_filtered_targets(
    tmp_path: Path,
) -> None:
    # Grep-filtered runs should skip fixture prep when target paths and selector text have no plugin hint.
    sandbox_root = _build_fixture_target_sandbox(tmp_path)

    assert not _should_build_for_targets(
        sandbox_root,
        "playwright",
        ["--grep", "workspace", "frontend/tests/e2e/editor"],
    )


def test_pytest_fixture_selection_skips_non_plugin_selector_with_target(
    tmp_path: Path,
) -> None:
    # Selector + explicit non-plugin target should skip fixture prep unless selector hints plugins.
    sandbox_root = _build_fixture_target_sandbox(tmp_path)

    assert not _should_build_for_targets(
        sandbox_root,
        "pytest",
        [
            "-k",
            "project_config",
            "tests/project_state/test_project_config_view_modes.py",
        ],
    )


def test_pytest_fixture_selection_skips_selector_only_runs_without_plugin_hints(
    tmp_path: Path,
) -> None:
    # Selector-only pytest runs without plugin hints should skip fixture prep.
    sandbox_root = _build_fixture_target_sandbox(tmp_path)

    assert not _should_build_for_targets(
        sandbox_root,
        "pytest",
        ["-k", "project_config"],
    )


def test_pytest_fixture_selection_builds_selector_only_runs_when_outputs_are_missing(
    tmp_path: Path,
) -> None:
    # Selector-only runs should rebuild when fixture outputs are currently missing.
    sandbox_root = _build_fixture_target_sandbox(tmp_path)
    (
        sandbox_root
        / "tests"
        / "fixtures"
        / "plugins"
        / "fixture-a"
        / "frontend"
        / "dist"
        / "index.js"
    ).unlink()

    assert _should_build_for_targets(
        sandbox_root,
        "pytest",
        ["-k", "project_config"],
    )


def test_pytest_fixture_selection_skips_nonplugin_substring_selector(
    tmp_path: Path,
) -> None:
    # Substrings like "nonplugin" should not be treated as plugin intent.
    sandbox_root = _build_fixture_target_sandbox(tmp_path)

    assert not _should_build_for_targets(
        sandbox_root,
        "pytest",
        ["-k", "nonplugin"],
    )


def test_pytest_fixture_selection_skips_nonplugin_target_path_name(
    tmp_path: Path,
) -> None:
    # Target paths containing "nonplugin" should not trigger plugin fixture prep.
    sandbox_root = _build_fixture_target_sandbox(tmp_path)

    assert not _should_build_for_targets(
        sandbox_root,
        "pytest",
        ["tests/test_nonplugin_runner.py"],
    )


def test_pytest_fixture_selection_treats_markers_flag_as_valueless_selector(
    tmp_path: Path,
) -> None:
    # "--markers" is informational in pytest and should not force plugin fixture prep.
    sandbox_root = _build_fixture_target_sandbox(tmp_path)

    assert not _should_build_for_targets(
        sandbox_root,
        "pytest",
        ["--markers"],
    )


def test_pytest_fixture_selection_builds_for_plugin_marker_expressions(
    tmp_path: Path,
) -> None:
    # Marker expressions that explicitly mention plugin intent should build fixtures.
    sandbox_root = _build_fixture_target_sandbox(tmp_path)

    assert _should_build_for_targets(
        sandbox_root,
        "pytest",
        ["-m", "plugin and smoke"],
    )


def test_pytest_fixture_selection_builds_for_full_run_without_selectors(
    tmp_path: Path,
) -> None:
    # Full pytest runs should still build fixtures because plugin tests may be included.
    sandbox_root = _build_fixture_target_sandbox(tmp_path)

    assert _should_build_for_targets(sandbox_root, "pytest", [])


def test_playwright_fixture_selection_builds_for_full_run_without_selectors(
    tmp_path: Path,
) -> None:
    # Full Playwright runs should still build fixtures because plugin specs may be included.
    sandbox_root = _build_fixture_target_sandbox(tmp_path)

    assert _should_build_for_targets(sandbox_root, "playwright", [])


def test_pytest_fixture_selection_builds_when_selector_mentions_plugins(
    tmp_path: Path,
) -> None:
    # Selector hints should trigger fixture prep even with explicit non-plugin targets.
    sandbox_root = _build_fixture_target_sandbox(tmp_path)

    assert _should_build_for_targets(
        sandbox_root,
        "pytest",
        [
            "-k",
            "plugin runtime",
            "tests/project_state/test_project_config_view_modes.py",
        ],
    )


def test_pytest_fixture_selection_builds_for_plugin_named_target_file(
    tmp_path: Path,
) -> None:
    # Target file paths containing "plugin" should trigger fixture prep.
    sandbox_root = _build_fixture_target_sandbox(tmp_path)

    assert _should_build_for_targets(
        sandbox_root,
        "pytest",
        ["tests/start/test_start_plugins.py"],
    )
