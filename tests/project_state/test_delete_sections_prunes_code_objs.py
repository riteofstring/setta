import pytest

from setta.project_state.project_manager_types import (
    AddKwargRequest,
    CreateTopLevelSectionRequest,
    DeleteSectionsRequest,
)
from setta.types.id import ID
from setta.types.project_config import Position
from setta.types.section_impls import SectionType

from tests.utils.manager_fixture import real_project_manager


@pytest.mark.asyncio
async def test_delete_sections_prunes_code_objs():
    async with real_project_manager() as fixture:
        manager = fixture.manager

        default_config_id = manager.project_state_backend.defaultProjectConfigId
        assert default_config_id is not None
        default_config_id = ID(default_config_id)

        # Ensure any one-time init work is done before we snapshot baselines.
        await manager.load_project_config(default_config_id)

        baseline_state = manager.get_single_config_state(default_config_id)
        baseline_code_objs = len(baseline_state.codeObjs)
        baseline_code_obj_variants = len(baseline_state.codeObjVariants)
        baseline_code_obj_impls = len(baseline_state.codeObjImpls)

        for _ in range(3):
            response = await manager.create_top_level_section(
                CreateTopLevelSectionRequest(
                    projectConfigId=default_config_id,
                    implType=SectionType.Dict,
                    position=Position(x=0, y=0),
                )
            )
            section_id = response.sectionId

            for _ in range(8):
                await manager.add_kwarg(
                    AddKwargRequest(
                        projectConfigId=default_config_id,
                        sectionId=section_id,
                    )
                )

            mutated_state = manager.get_single_config_state(default_config_id)
            assert len(mutated_state.codeObjs) > baseline_code_objs

            await manager.delete_sections(
                DeleteSectionsRequest(
                    projectConfigId=default_config_id,
                    sectionIds=[section_id],
                )
            )

            pruned_state = manager.get_single_config_state(default_config_id)
            assert len(pruned_state.codeObjs) == baseline_code_objs
            assert len(pruned_state.codeObjVariants) == baseline_code_obj_variants
            assert len(pruned_state.codeObjImpls) == baseline_code_obj_impls

