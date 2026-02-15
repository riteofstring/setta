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
