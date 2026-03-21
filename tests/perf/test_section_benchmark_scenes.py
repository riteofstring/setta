from pathlib import Path

from setta.database.db_objs import DBE
from setta.perf.section_benchmark_scenes import (
    READY_SCENE_AVAILABILITY,
    get_section_benchmark_scene,
    install_section_benchmark_scene,
    load_section_benchmark_scene_manifest,
    resolve_section_benchmark_scene_fixture_path,
)


def test_settings_scene_manifest_points_at_checked_in_fixture() -> None:
    manifest = load_section_benchmark_scene_manifest()

    assert manifest["settings"]["availability"] == READY_SCENE_AVAILABILITY
    fixture_path = resolve_section_benchmark_scene_fixture_path(manifest["settings"])
    assert fixture_path.exists()
    assert fixture_path.name == "settings.settings-project.json"


def test_install_settings_scene_writes_settings_project_fixture(tmp_path: Path) -> None:
    result = install_section_benchmark_scene("settings", tmp_path)

    dbe = DBE(tmp_path)
    project_state = dbe.read_settings_project()
    assert result["storageKind"] == "settings_project"
    assert result["routePath"] == "/settings"
    assert result["projectConfigName"] == "settings"
    assert project_state.projectConfig.name == "settings"
    assert len(project_state.projectConfig.sectionVariantMap) == 46


def test_install_rejects_planned_scene_until_fixture_is_ready(tmp_path: Path) -> None:
    scene = get_section_benchmark_scene("tier1Synthetic")
    assert scene["availability"] == "planned"

    try:
        install_section_benchmark_scene("tier1Synthetic", tmp_path)
    except ValueError as exc:
        assert "not ready" in str(exc)
    else:
        raise AssertionError("Expected planned benchmark scene installation to fail.")
