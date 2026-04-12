from contextlib import AsyncExitStack
from unittest.mock import patch

import pytest
import pytest_asyncio

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
        message, *args = info_mock.call_args.args
        assert "load_project_config_timing" in message
        assert args[0] == project_config_id
        assert args[1] is True
        assert args[3] >= 0
        assert args[6] is False
        assert args[7] >= 0
        assert args[8] >= 0
        assert args[9] >= 0

    async def test_settings_load_skips_init_after_first_warm_load(self) -> None:
        await self.manager.load_project_config(self.project_config_id)

        with patch("setta.project_state.base_project_manager.logger.info") as info_mock:
            await self.manager.load_project_config(self.project_config_id)

        assert info_mock.call_count == 1
        message, *args = info_mock.call_args.args
        assert "load_project_config_timing" in message
        assert args[0] == self.project_config_id
        assert args[1] is False
        assert args[5] == 0.0
        assert args[6] is True

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
        message, *args = info_mock.call_args.args
        assert "load_project_config_timing" in message
        assert args[0] == project_config_id
        assert args[1] is False
        assert args[5] == 0.0
        assert args[6] is True

    async def test_settings_warm_load_logs_validation_split_as_cache_hit(
        self,
    ) -> None:
        await self.manager.load_project_config(self.project_config_id)

        with patch("setta.project_state.base_project_manager.logger.info") as info_mock:
            await self.manager.load_project_config(self.project_config_id)

        assert info_mock.call_count == 1
        _message, *args = info_mock.call_args.args
        assert args[6] is True
        assert args[7] >= 0
        assert args[8] >= 0
        assert args[9] >= 0

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
