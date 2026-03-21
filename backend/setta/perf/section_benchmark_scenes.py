from pathlib import Path
import json

from setta.database.db_objs import DBE
from setta.types.helpers_lvl3 import merge_single_config_into_backend
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig


REPO_ROOT = Path(__file__).resolve().parents[3]
SCENE_MANIFEST_PATH = (
    REPO_ROOT / "perf" / "fixtures" / "section-benchmarks" / "scene-manifest.json"
)
SETTINGS_PROJECT_STORAGE_KIND = "settings_project"
MAIN_PROJECT_CONFIG_STORAGE_KIND = "main_project_config"
READY_SCENE_AVAILABILITY = "ready"


def load_section_benchmark_scene_manifest() -> dict[str, dict]:
    payload = json.loads(SCENE_MANIFEST_PATH.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise TypeError("Section benchmark scene manifest must be a JSON object.")
    return payload


def get_section_benchmark_scene(scene_id: str) -> dict:
    manifest = load_section_benchmark_scene_manifest()
    if scene_id not in manifest:
        known_scene_ids = ", ".join(sorted(manifest.keys()))
        raise KeyError(
            f"Unknown section benchmark scene '{scene_id}'. Known scene ids: {known_scene_ids}."
        )
    scene = manifest[scene_id]
    if not isinstance(scene, dict):
        raise TypeError(f"Scene manifest entry '{scene_id}' must be a JSON object.")
    return scene


def resolve_section_benchmark_scene_fixture_path(scene: dict) -> Path:
    fixture_path = scene.get("fixturePath")
    if not fixture_path:
        raise KeyError("Scene manifest entry is missing fixturePath.")
    return REPO_ROOT / fixture_path


def install_section_benchmark_scene(scene_id: str, state_root: Path) -> dict[str, str]:
    scene = get_section_benchmark_scene(scene_id)
    availability = scene.get("availability")
    if availability != READY_SCENE_AVAILABILITY:
        raise ValueError(
            f"Scene '{scene_id}' is not ready. availability={availability!r}"
        )

    scene_path = resolve_section_benchmark_scene_fixture_path(scene)
    storage_kind = scene.get("storageKind")
    fixture_payload = scene_path.read_text(encoding="utf-8")
    single_config = ProjectStateSingleConfig.model_validate_json(fixture_payload)
    dbe = DBE(Path(state_root))

    if storage_kind == SETTINGS_PROJECT_STORAGE_KIND:
        dbe.write_settings_project(single_config)
        return {
            "sceneId": scene_id,
            "storageKind": storage_kind,
            "targetPath": str(dbe.settings_project),
            "routePath": scene["routePath"],
            "projectConfigName": single_config.projectConfig.name,
            "projectConfigId": str(single_config.projectConfig.id),
        }

    if storage_kind == MAIN_PROJECT_CONFIG_STORAGE_KIND:
        backend = (
            dbe.read_project_required() if dbe.project.exists() else ProjectStateBackend()
        )
        merged = merge_single_config_into_backend(backend, single_config)
        merged.defaultProjectConfigId = single_config.projectConfig.id
        dbe.write_project(merged)
        return {
            "sceneId": scene_id,
            "storageKind": storage_kind,
            "targetPath": str(dbe.project),
            "routePath": scene["routePath"],
            "projectConfigName": single_config.projectConfig.name,
            "projectConfigId": str(single_config.projectConfig.id),
        }

    raise ValueError(
        f"Unsupported section benchmark scene storage kind: {storage_kind!r}"
    )
