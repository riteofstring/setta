from contextlib import AsyncExitStack
from statistics import fmean
from unittest.mock import patch

from tests.utils.manager_fixture import real_project_manager, real_settings_manager


TIMING_LOG_LABELS = [
    "project_config_id",
    "did_init",
    "section_count",
    "convert_ms",
    "convert_collect_ids_ms",
    "convert_slice_state_ms",
    "convert_project_state_ms",
    "convert_project_state_model_overhead_ms",
    "convert_project_state_content_validation_ms",
    "convert_project_state_singleton_sections_ms",
    "convert_project_state_active_ids_ms",
    "convert_project_state_parent_section_map_ms",
    "convert_project_state_shown_param_ids_ms",
    "convert_project_state_shown_param_ids_effective_section_lookup_ms",
    "convert_project_state_shown_param_ids_get_param_ids_to_show_ms",
    "convert_project_state_shown_param_ids_traverse_hierarchy_ms",
    "convert_project_state_shown_param_ids_filter_for_ui_display_ms",
    "convert_project_state_required_decoded_images_ms",
    "convert_project_state_code_file_bindings_ms",
    "convert_project_state_layout_validation_ms",
    "init_ms",
    "init_update_ms",
    "validation_cache_hit",
    "validation_resolve_ms",
    "validation_broadcast_ms",
    "validation_ms",
    "total_ms",
]


def get_timing_log_values(info_mock) -> dict[str, object]:
    _message, *args = info_mock.call_args.args
    return dict(zip(TIMING_LOG_LABELS, args, strict=True))


async def capture_fixture_load_project_config_timings(
    fixture_factory,
    *,
    warmup_count: int = 1,
    sample_count: int = 3,
) -> list[dict[str, object]]:
    async with AsyncExitStack() as stack:
        fixture = await stack.enter_async_context(fixture_factory())
        manager = fixture.manager
        project_config_id = manager.project_state_backend.defaultProjectConfigId

        for _ in range(warmup_count):
            await manager.load_project_config(project_config_id)

        samples: list[dict[str, object]] = []
        for _ in range(sample_count):
            with patch("setta.project_state.base_project_manager.logger.info") as info_mock:
                await manager.load_project_config(project_config_id)
            samples.append(get_timing_log_values(info_mock))

    return samples


async def capture_direct_settings_load_project_config_timings(
    *,
    sample_count: int = 3,
) -> dict[str, list[dict[str, object]]]:
    return {
        "settings": await capture_fixture_load_project_config_timings(
            real_settings_manager,
            sample_count=sample_count,
        ),
        "project": await capture_fixture_load_project_config_timings(
            real_project_manager,
            sample_count=sample_count,
        ),
    }


def average_numeric_timing_fields(
    samples: list[dict[str, object]],
    keys: list[str],
) -> dict[str, float]:
    return {
        key: fmean(float(sample[key]) for sample in samples)
        for key in keys
    }
