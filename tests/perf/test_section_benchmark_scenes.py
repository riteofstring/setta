from collections import Counter
from pathlib import Path

from setta.database.db_objs import DBE
from setta.perf.section_benchmark_scenes import (
    READY_SCENE_AVAILABILITY,
    get_section_benchmark_scene,
    install_section_benchmark_scene,
    load_section_benchmark_scene_manifest,
    resolve_section_benchmark_state_root,
    resolve_section_benchmark_scene_fixture_path,
)
from setta.types.helpers_lvl1 import get_curr_effective_section_impl
from setta.types.helpers_lvl3 import convert_backend_to_single_config


def test_settings_scene_manifest_points_at_checked_in_fixture() -> None:
    manifest = load_section_benchmark_scene_manifest()

    assert manifest["settings"]["availability"] == READY_SCENE_AVAILABILITY
    fixture_path = resolve_section_benchmark_scene_fixture_path(manifest["settings"])
    assert fixture_path.exists()
    assert fixture_path.name == "settings.settings-project.json"


def test_tier1_scene_manifest_points_at_checked_in_fixture() -> None:
    manifest = load_section_benchmark_scene_manifest()

    assert manifest["tier1Synthetic"]["availability"] == READY_SCENE_AVAILABILITY
    fixture_path = resolve_section_benchmark_scene_fixture_path(
        manifest["tier1Synthetic"]
    )
    assert fixture_path.exists()
    assert fixture_path.name == "tier1-synthetic.project.json"


def test_resolve_state_root_uses_call_site_cwd_for_relative_paths(tmp_path: Path) -> None:
    relative_root = Path("setta_files_dev")
    resolved = resolve_section_benchmark_state_root(relative_root, cwd=tmp_path)

    assert resolved == tmp_path / "setta_files_dev"


def test_resolve_state_root_keeps_absolute_paths_unchanged(tmp_path: Path) -> None:
    absolute_root = tmp_path / "absolute-state-root"
    resolved = resolve_section_benchmark_state_root(absolute_root, cwd=tmp_path / "other")

    assert resolved == absolute_root


def test_install_settings_scene_writes_settings_project_fixture(tmp_path: Path) -> None:
    result = install_section_benchmark_scene("settings", tmp_path)

    dbe = DBE(tmp_path)
    project_state = dbe.read_settings_project()
    assert result["storageKind"] == "settings_project"
    assert result["routePath"] == "/settings"
    assert result["projectConfigName"] == "settings"
    assert project_state.projectConfig.name == "settings"
    assert len(project_state.projectConfig.sectionVariantMap) == 46


def test_install_tier1_scene_writes_main_project_fixture(tmp_path: Path) -> None:
    result = install_section_benchmark_scene("tier1Synthetic", tmp_path)

    dbe = DBE(tmp_path)
    backend = dbe.read_project_required()
    assert backend.defaultProjectConfigId is not None
    project_state = convert_backend_to_single_config(
        backend, backend.defaultProjectConfigId
    )
    installed_scene = get_section_benchmark_scene("tier1Synthetic")
    section_type_counts = Counter(
        get_curr_effective_section_impl(project_state, section_id).type.value
        for section_id in project_state.projectConfig.sectionVariantMap
    )

    assert result["storageKind"] == "main_project_config"
    assert result["routePath"] == "/benchmark-tier1"
    assert result["projectConfigName"] == "benchmark-tier1"
    assert project_state.projectConfig.name == "benchmark-tier1"
    assert len(project_state.projectConfig.topLevelSections) == 25
    assert len(project_state.sections) == 45
    assert section_type_counts == {
        "Callable": 8,
        "Dict": 32,
        "GlobalVariables": 1,
        "ListRoot": 4,
    }
    assert installed_scene["benchmarkConfig"]["targetSectionPattern"] == "callable_00"


def test_install_rejects_planned_scene_until_fixture_is_ready(tmp_path: Path) -> None:
    scene = get_section_benchmark_scene("tier2Synthetic")
    assert scene["availability"] == "planned"

    try:
        install_section_benchmark_scene("tier2Synthetic", tmp_path)
    except ValueError as exc:
        assert "not ready" in str(exc)
    else:
        raise AssertionError("Expected planned benchmark scene installation to fail.")


def test_install_rejects_combined_scene_until_fixture_is_ready(tmp_path: Path) -> None:
    scene = get_section_benchmark_scene("tier1Tier2CombinedSynthetic")
    assert scene["availability"] == "planned"

    try:
        install_section_benchmark_scene("tier1Tier2CombinedSynthetic", tmp_path)
    except ValueError as exc:
        assert "not ready" in str(exc)
    else:
        raise AssertionError("Expected planned benchmark scene installation to fail.")
