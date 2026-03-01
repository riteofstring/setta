import pytest

from setta.types.id import ID

from tests.utils.manager_fixture import real_project_manager


@pytest.mark.asyncio
async def test_delete_project_configs_missing_id_does_not_apply_partial_deletes() -> None:
    async with real_project_manager() as fixture:
        manager = fixture.manager
        existing_ids_before = set(manager.project_state_backend.projectConfigs.keys())

        await manager.create_project_config(previewImgColor="#111111")
        ids_after_first_create = set(manager.project_state_backend.projectConfigs.keys())
        first_created_ids = ids_after_first_create - existing_ids_before
        assert len(first_created_ids) == 1
        first_created_id = next(iter(first_created_ids))

        await manager.create_project_config(previewImgColor="#222222")
        ids_after_second_create = set(manager.project_state_backend.projectConfigs.keys())
        second_created_ids = ids_after_second_create - ids_after_first_create
        assert len(second_created_ids) == 1
        second_created_id = next(iter(second_created_ids))

        default_project_config_id_before = (
            manager.project_state_backend.defaultProjectConfigId
        )
        missing_project_config_id = ID("missing-project-config-id")

        # Deleting multiple configs must validate all ids before mutating state,
        # otherwise the manager can apply a partial in-memory delete before
        # raising for a missing id.
        with pytest.raises(KeyError):
            await manager.delete_project_configs(
                [
                    first_created_id,
                    missing_project_config_id,
                    second_created_id,
                ]
            )

        remaining_ids = set(manager.project_state_backend.projectConfigs.keys())
        assert first_created_id in remaining_ids
        assert second_created_id in remaining_ids
        assert manager.project_state_backend.defaultProjectConfigId == (
            default_project_config_id_before
        )


@pytest.mark.asyncio
async def test_delete_project_configs_ignores_duplicate_ids() -> None:
    async with real_project_manager() as fixture:
        manager = fixture.manager
        existing_ids_before = set(manager.project_state_backend.projectConfigs.keys())

        await manager.create_project_config(previewImgColor="#123456")
        ids_after_create = set(manager.project_state_backend.projectConfigs.keys())
        created_ids = ids_after_create - existing_ids_before
        assert len(created_ids) == 1
        created_project_config_id = next(iter(created_ids))

        # Duplicate ids in one delete request should be treated as one target so
        # the operation is idempotent and does not fail mid-delete.
        await manager.delete_project_configs(
            [created_project_config_id, created_project_config_id]
        )

        remaining_ids = set(manager.project_state_backend.projectConfigs.keys())
        assert created_project_config_id not in remaining_ids
