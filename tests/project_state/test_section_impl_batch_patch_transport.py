import pytest

from setta.project_state.project_manager_types import (
    CreateTopLevelSectionRequest,
    SetSectionSizesRequest,
)
from setta.types.project_config import Position
from setta.types.section_impls import SectionSize, SectionType
from tests.utils.manager_fixture import real_project_manager


@pytest.mark.asyncio
async def test_set_section_sizes_batches_section_impl_patches_for_three_sections() -> None:
    async with real_project_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_config_id = manager.project_state_backend.defaultProjectConfigId
        if project_config_id is None:
            raise KeyError("Missing default project config id.")

        section_ids: list[str] = []
        for idx in range(3):
            create_response = await manager.create_top_level_section(
                CreateTopLevelSectionRequest(
                    projectConfigId=project_config_id,
                    implType=SectionType.Dict,
                    position=Position(x=float(idx * 240), y=0.0),
                )
            )
            section_ids.append(create_response.sectionId)
        await manager.finish_pending_operations(timeout=5.0)

        sender = manager.websocket_msg_handler
        single_section_patch_calls = 0
        batch_section_patch_calls: list[dict[str, object]] = []

        original_single_patch = sender.broadcast_project_state_section_impl_patch
        original_batch_patch = sender.broadcast_project_state_section_impls_patch

        async def record_single_patch(
            project_config_id_for_patch,
            section_id_for_patch,
            section_impl_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            nonlocal single_section_patch_calls
            single_section_patch_calls += 1
            await original_single_patch(
                project_config_id_for_patch,
                section_id_for_patch,
                section_impl_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        async def record_batch_patch(
            project_config_id_for_patch,
            section_impls_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            batch_section_patch_calls.append(
                {
                    "projectConfigId": project_config_id_for_patch,
                    "sectionIds": list(section_impls_for_patch.keys()),
                    "previousProjectStateRevision": previous_project_state_revision,
                    "projectStateRevision": project_state_revision,
                    "completedOpIds": list(completed_op_ids),
                    "pendingOpIds": list(pending_op_ids),
                }
            )
            await original_batch_patch(
                project_config_id_for_patch,
                section_impls_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        sender.broadcast_project_state_section_impl_patch = (  # type: ignore[method-assign]
            record_single_patch
        )
        sender.broadcast_project_state_section_impls_patch = (  # type: ignore[method-assign]
            record_batch_patch
        )
        try:
            # Large multi-section updates should be transported as one batch patch.
            await manager.set_section_sizes(
                SetSectionSizesRequest(
                    projectConfigId=project_config_id,
                    sectionSizes={
                        section_ids[0]: SectionSize(width=640.0, height=420.0),
                        section_ids[1]: SectionSize(width=680.0, height=430.0),
                        section_ids[2]: SectionSize(width=720.0, height=440.0),
                    },
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            sender.broadcast_project_state_section_impl_patch = (  # type: ignore[method-assign]
                original_single_patch
            )
            sender.broadcast_project_state_section_impls_patch = (  # type: ignore[method-assign]
                original_batch_patch
            )

        assert single_section_patch_calls == 0
        assert len(batch_section_patch_calls) == 1
        patch = batch_section_patch_calls[0]
        assert patch["projectConfigId"] == project_config_id
        assert set(patch["sectionIds"]) == set(section_ids)
        assert int(patch["previousProjectStateRevision"]) < int(
            patch["projectStateRevision"]
        )


@pytest.mark.asyncio
async def test_set_section_sizes_keeps_single_patch_transport_for_two_sections() -> None:
    async with real_project_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_config_id = manager.project_state_backend.defaultProjectConfigId
        if project_config_id is None:
            raise KeyError("Missing default project config id.")

        section_ids: list[str] = []
        for idx in range(2):
            create_response = await manager.create_top_level_section(
                CreateTopLevelSectionRequest(
                    projectConfigId=project_config_id,
                    implType=SectionType.Dict,
                    position=Position(x=float(idx * 240), y=0.0),
                )
            )
            section_ids.append(create_response.sectionId)
        await manager.finish_pending_operations(timeout=5.0)

        sender = manager.websocket_msg_handler
        single_section_patch_calls = 0
        batch_section_patch_calls = 0

        original_single_patch = sender.broadcast_project_state_section_impl_patch
        original_batch_patch = sender.broadcast_project_state_section_impls_patch

        async def record_single_patch(
            project_config_id_for_patch,
            section_id_for_patch,
            section_impl_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            nonlocal single_section_patch_calls
            single_section_patch_calls += 1
            await original_single_patch(
                project_config_id_for_patch,
                section_id_for_patch,
                section_impl_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        async def record_batch_patch(
            project_config_id_for_patch,
            section_impls_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            nonlocal batch_section_patch_calls
            batch_section_patch_calls += 1
            await original_batch_patch(
                project_config_id_for_patch,
                section_impls_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        sender.broadcast_project_state_section_impl_patch = (  # type: ignore[method-assign]
            record_single_patch
        )
        sender.broadcast_project_state_section_impls_patch = (  # type: ignore[method-assign]
            record_batch_patch
        )
        try:
            # Small updates should retain current per-section transport behavior.
            await manager.set_section_sizes(
                SetSectionSizesRequest(
                    projectConfigId=project_config_id,
                    sectionSizes={
                        section_ids[0]: SectionSize(width=610.0, height=410.0),
                        section_ids[1]: SectionSize(width=650.0, height=420.0),
                    },
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            sender.broadcast_project_state_section_impl_patch = (  # type: ignore[method-assign]
                original_single_patch
            )
            sender.broadcast_project_state_section_impls_patch = (  # type: ignore[method-assign]
                original_batch_patch
            )

        assert single_section_patch_calls == 2
        assert batch_section_patch_calls == 0
