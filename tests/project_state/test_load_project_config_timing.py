from contextlib import AsyncExitStack
from unittest.mock import patch

import pytest
import pytest_asyncio

from tests.project_state.load_project_config_timing_capture import (
    TIMING_LOG_LABELS,
    capture_fixture_load_project_config_timings,
    get_timing_log_values,
)
from tests.utils.manager_fixture import real_project_manager, real_settings_manager


@pytest.mark.asyncio
class TestLoadProjectConfigTiming:
    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self):
        self._exit_stack = AsyncExitStack()
        fixture = await self._exit_stack.enter_async_context(real_settings_manager())
        self.manager = fixture.manager
        self.project_config_id = (
            self.manager.project_state_backend.defaultProjectConfigId
        )

        yield

        await self._exit_stack.aclose()

    async def test_logs_when_first_project_load_requires_init(self) -> None:
        async with AsyncExitStack() as exit_stack:
            fixture = await exit_stack.enter_async_context(real_project_manager())
            manager = fixture.manager
            project_config_id = manager.project_state_backend.defaultProjectConfigId

            with patch(
                "setta.project_state.base_project_manager.logger.info"
            ) as info_mock:
                await manager.load_project_config(project_config_id)

        assert info_mock.call_count == 1
        message, *_args = info_mock.call_args.args
        timing = get_timing_log_values(info_mock)
        assert "load_project_config_timing" in message
        assert timing["project_config_id"] == project_config_id
        assert timing["did_init"] is True
        assert timing["convert_ms"] >= 0
        assert timing["convert_collect_ids_ms"] >= 0
        assert timing["convert_slice_state_ms"] >= 0
        assert timing["convert_project_state_ms"] >= 0
        assert timing["convert_project_state_model_overhead_ms"] >= 0
        assert timing["convert_project_state_content_validation_ms"] >= 0
        assert timing["convert_project_state_singleton_sections_ms"] >= 0
        assert timing["convert_project_state_active_ids_ms"] >= 0
        assert timing["convert_project_state_parent_section_map_ms"] >= 0
        assert timing["convert_project_state_shown_param_ids_ms"] >= 0
        assert timing[
            "convert_project_state_shown_param_ids_effective_section_lookup_ms"
        ] >= 0
        assert timing[
            "convert_project_state_shown_param_ids_get_param_ids_to_show_ms"
        ] >= 0
        assert timing[
            "convert_project_state_shown_param_ids_traverse_hierarchy_ms"
        ] >= 0
        assert timing[
            "convert_project_state_shown_param_ids_filter_for_ui_display_ms"
        ] >= 0
        assert timing["convert_project_state_required_decoded_images_ms"] >= 0
        assert timing["convert_project_state_code_file_bindings_ms"] >= 0
        assert timing["convert_project_state_layout_validation_ms"] >= 0
        assert timing["validation_cache_hit"] is False
        assert timing["validation_resolve_ms"] >= 0
        assert timing["validation_broadcast_ms"] >= 0
        assert timing["validation_ms"] >= 0

    async def test_settings_load_logs_convert_breakdown_on_warm_load(self) -> None:
        await self.manager.load_project_config(self.project_config_id)

        with patch("setta.project_state.base_project_manager.logger.info") as info_mock:
            await self.manager.load_project_config(self.project_config_id)

        assert info_mock.call_count == 1
        timing = get_timing_log_values(info_mock)
        assert timing["convert_ms"] >= 0
        assert timing["convert_collect_ids_ms"] >= 0
        assert timing["convert_slice_state_ms"] >= 0
        assert timing["convert_project_state_ms"] >= 0
        assert timing["convert_project_state_model_overhead_ms"] >= 0
        assert timing["convert_project_state_content_validation_ms"] >= 0
        assert timing["convert_project_state_singleton_sections_ms"] >= 0
        assert timing["convert_project_state_active_ids_ms"] >= 0
        assert timing["convert_project_state_parent_section_map_ms"] >= 0
        assert timing["convert_project_state_shown_param_ids_ms"] >= 0
        assert timing[
            "convert_project_state_shown_param_ids_effective_section_lookup_ms"
        ] >= 0
        assert timing[
            "convert_project_state_shown_param_ids_get_param_ids_to_show_ms"
        ] >= 0
        assert timing[
            "convert_project_state_shown_param_ids_traverse_hierarchy_ms"
        ] >= 0
        assert timing[
            "convert_project_state_shown_param_ids_filter_for_ui_display_ms"
        ] >= 0
        assert timing["convert_project_state_required_decoded_images_ms"] >= 0
        assert timing["convert_project_state_code_file_bindings_ms"] >= 0
        assert timing["convert_project_state_layout_validation_ms"] >= 0
        assert timing["convert_ms"] >= timing["convert_collect_ids_ms"]
        assert timing["convert_ms"] >= timing["convert_slice_state_ms"]
        assert timing["convert_ms"] >= timing["convert_project_state_ms"]
        assert (
            timing["convert_project_state_ms"]
            >= timing["convert_project_state_model_overhead_ms"]
        )
        assert (
            timing["convert_project_state_ms"]
            >= timing["convert_project_state_content_validation_ms"]
        )
        assert (
            timing["convert_project_state_ms"]
            >= timing["convert_project_state_layout_validation_ms"]
        )
        assert (
            timing["convert_project_state_content_validation_ms"]
            >= timing["convert_project_state_singleton_sections_ms"]
        )
        assert (
            timing["convert_project_state_content_validation_ms"]
            >= timing["convert_project_state_active_ids_ms"]
        )
        assert (
            timing["convert_project_state_content_validation_ms"]
            >= timing["convert_project_state_parent_section_map_ms"]
        )
        assert (
            timing["convert_project_state_content_validation_ms"]
            >= timing["convert_project_state_shown_param_ids_ms"]
        )
        assert (
            timing["convert_project_state_content_validation_ms"]
            >= timing["convert_project_state_required_decoded_images_ms"]
        )
        assert (
            timing["convert_project_state_content_validation_ms"]
            >= timing["convert_project_state_code_file_bindings_ms"]
        )
        assert timing["convert_project_state_shown_param_ids_ms"] >= timing[
            "convert_project_state_shown_param_ids_effective_section_lookup_ms"
        ]
        assert timing["convert_project_state_shown_param_ids_ms"] >= timing[
            "convert_project_state_shown_param_ids_get_param_ids_to_show_ms"
        ]
        assert timing["convert_project_state_shown_param_ids_get_param_ids_to_show_ms"] >= timing[
            "convert_project_state_shown_param_ids_traverse_hierarchy_ms"
        ]
        assert timing["convert_project_state_shown_param_ids_get_param_ids_to_show_ms"] >= timing[
            "convert_project_state_shown_param_ids_filter_for_ui_display_ms"
        ]
        assert timing["convert_project_state_shown_param_ids_ms"] + 1e-6 >= (
            timing["convert_project_state_shown_param_ids_effective_section_lookup_ms"]
            + timing["convert_project_state_shown_param_ids_get_param_ids_to_show_ms"]
        )
        assert timing["convert_project_state_shown_param_ids_get_param_ids_to_show_ms"] + 1e-6 >= (
            timing["convert_project_state_shown_param_ids_traverse_hierarchy_ms"]
            + timing["convert_project_state_shown_param_ids_filter_for_ui_display_ms"]
        )
        assert timing["convert_project_state_content_validation_ms"] + 1e-6 >= (
            timing["convert_project_state_singleton_sections_ms"]
            + timing["convert_project_state_active_ids_ms"]
            + timing["convert_project_state_parent_section_map_ms"]
            + timing["convert_project_state_shown_param_ids_ms"]
            + timing["convert_project_state_required_decoded_images_ms"]
            + timing["convert_project_state_code_file_bindings_ms"]
        )
        assert timing["convert_project_state_ms"] + 1e-6 >= (
            timing["convert_project_state_model_overhead_ms"]
            + timing["convert_project_state_content_validation_ms"]
            + timing["convert_project_state_layout_validation_ms"]
        )

    async def test_settings_load_skips_init_after_first_warm_load(self) -> None:
        await self.manager.load_project_config(self.project_config_id)

        with patch("setta.project_state.base_project_manager.logger.info") as info_mock:
            await self.manager.load_project_config(self.project_config_id)

        assert info_mock.call_count == 1
        message, *_args = info_mock.call_args.args
        timing = get_timing_log_values(info_mock)
        assert "load_project_config_timing" in message
        assert timing["project_config_id"] == self.project_config_id
        assert timing["did_init"] is False
        assert timing["init_update_ms"] == 0.0
        assert timing["validation_cache_hit"] is True

    async def test_logs_when_subsequent_project_load_skips_init(self) -> None:
        async with AsyncExitStack() as exit_stack:
            fixture = await exit_stack.enter_async_context(real_project_manager())
            manager = fixture.manager
            project_config_id = manager.project_state_backend.defaultProjectConfigId

            await manager.load_project_config(project_config_id)

            with patch(
                "setta.project_state.base_project_manager.logger.info"
            ) as info_mock:
                await manager.load_project_config(project_config_id)

        assert info_mock.call_count == 1
        message, *_args = info_mock.call_args.args
        timing = get_timing_log_values(info_mock)
        assert "load_project_config_timing" in message
        assert timing["project_config_id"] == project_config_id
        assert timing["did_init"] is False
        assert timing["init_update_ms"] == 0.0
        assert timing["validation_cache_hit"] is True

    async def test_settings_warm_load_logs_validation_split_as_cache_hit(
        self,
    ) -> None:
        await self.manager.load_project_config(self.project_config_id)

        with patch("setta.project_state.base_project_manager.logger.info") as info_mock:
            await self.manager.load_project_config(self.project_config_id)

        assert info_mock.call_count == 1
        timing = get_timing_log_values(info_mock)
        assert timing["validation_cache_hit"] is True
        assert timing["validation_resolve_ms"] >= 0
        assert timing["validation_broadcast_ms"] >= 0
        assert timing["validation_ms"] >= 0

    async def test_settings_warm_load_reuses_cached_name_validation_errors(
        self,
    ) -> None:
        await self.manager.load_project_config(self.project_config_id)

        # A no-op warm load should reuse the prior validation payload instead of
        # recomputing the expensive name-validation collectors.
        with patch(
            "setta.project_state.base_project_manager.collect_section_name_conflicts",
            return_value={},
        ) as conflicts_mock:
            await self.manager.load_project_config(self.project_config_id)

        conflicts_mock.assert_not_called()

    async def test_settings_name_validation_cache_invalidates_after_state_change(
        self,
    ) -> None:
        project_state = await self.manager.load_project_config(self.project_config_id)
        section_id = next(iter(project_state.sections))
        project_state.sections[section_id].name += "_cache_bust"
        await self.manager.update(project_state)

        # A real backend revision change must force the validation collectors to
        # recompute instead of serving the stale cached payload.
        with patch(
            "setta.project_state.base_project_manager.collect_section_name_conflicts",
            return_value={},
        ) as conflicts_mock:
            await self.manager.load_project_config(self.project_config_id)

        assert conflicts_mock.call_count == 1

    async def test_capture_fixture_load_project_config_timings_returns_true_warm_samples(
        self,
    ) -> None:
        samples = await capture_fixture_load_project_config_timings(
            real_settings_manager,
            sample_count=2,
        )

        assert len(samples) == 2
        for sample in samples:
            assert sample["did_init"] is False
            assert sample["validation_cache_hit"] is True
            assert sample["total_ms"] >= sample["convert_ms"]
