from types import SimpleNamespace

from fastapi import HTTPException
import pytest

from setta.agentic.store import delete_prompt_template, save_prompt_template
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.project_state.project_manager_types import (
    CreateStateMachineEdgeRequest,
    CreateTopLevelSectionRequest,
    SetPromptTemplateLinkRequest,
    SetStateMachineSectionSettingsRequest,
)
from setta.routers.agentic import (
    DeletePromptTemplateRequest,
    UpdatePromptTemplateRequest,
    route_delete_prompt_template,
    route_update_prompt_template,
)
from setta.routers.project_manager import route_set_prompt_template_link
from setta.types.id import ID
from setta.types.project_config import Position
from setta.types.prompt import PromptFormat, PromptTemplate
from setta.types.section_impls import PromptSectionImpl, SectionType
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl3 import convert_backend_to_single_config
from setta.types.state_machine_edges import (
    STATE_MACHINE_EDGE_SOURCE_PORT_ID,
    STATE_MACHINE_EDGE_TARGET_PORT_ID,
    StateMachineTargetAction,
    StateMachineTargetActionType,
    StateMachineThreadStrategy,
)

from tests.utils.manager_fixture import real_project_manager, real_settings_manager
from tests.utils.runtime_context import runtime_context


def _build_state(project_fixture, settings_fixture):
    return SimpleNamespace(
        share_mode=False,
        deployment_mode=False,
        launcher_mode=False,
        dbe=project_fixture.dbe,
        wmh_frontend_sender=project_fixture.manager.websocket_msg_handler,
        prompt_template_watcher=None,
        project_manager_switcher=ProjectManagerSwitcher(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
        ),
    )


@pytest.mark.asyncio
async def test_route_set_prompt_template_link_returns_404_for_missing_template() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None

        prompt_response = await project_fixture.manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.Prompt,
                position=Position(),
            )
        )
        state = _build_state(project_fixture, settings_fixture)

        with runtime_context(state) as ctx:
            with pytest.raises(HTTPException) as exc_info:
                await route_set_prompt_template_link(
                    SetPromptTemplateLinkRequest(
                        projectConfigId=project_config_id,
                        sectionId=prompt_response.sectionId,
                        promptTemplateId=ID("missing-template"),
                    ),
                    ctx,
                )

        assert exc_info.value.status_code == 404
        assert "Prompt template missing-template not found." in str(
            exc_info.value.detail
        )


@pytest.mark.asyncio
async def test_route_set_prompt_template_link_rejects_non_prompt_sections() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None

        chat_response = await project_fixture.manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.Chat,
                position=Position(),
            )
        )
        prompt_template = PromptTemplate(
            id=ID("prompt-template-1"),
            name="Greeting",
            template="Hello there.",
        )
        save_prompt_template(project_fixture.dbe, prompt_template)
        state = _build_state(project_fixture, settings_fixture)

        with runtime_context(state) as ctx:
            with pytest.raises(HTTPException) as exc_info:
                await route_set_prompt_template_link(
                    SetPromptTemplateLinkRequest(
                        projectConfigId=project_config_id,
                        sectionId=chat_response.sectionId,
                        promptTemplateId=prompt_template.id,
                    ),
                    ctx,
                )

        assert exc_info.value.status_code == 400
        assert "failed type guard" in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_route_update_prompt_template_refreshes_linked_prompt_preview_state() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None

        prompt_response = await project_fixture.manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.Prompt,
                position=Position(),
            )
        )
        prompt_template = PromptTemplate(
            id=ID("prompt-template-1"),
            name="Greeting",
            template="Hello {{ name }}",
            format=PromptFormat.Jinja,
        )
        save_prompt_template(project_fixture.dbe, prompt_template)
        state = _build_state(project_fixture, settings_fixture)

        with runtime_context(state) as ctx:
            await route_set_prompt_template_link(
                SetPromptTemplateLinkRequest(
                    projectConfigId=project_config_id,
                    sectionId=prompt_response.sectionId,
                    promptTemplateId=prompt_template.id,
                ),
                ctx,
            )
            await route_update_prompt_template(
                UpdatePromptTemplateRequest(
                    template=prompt_template.model_copy(
                        update={"template": "Hello there."}
                    )
                ),
                ctx,
            )

        project_state = convert_backend_to_single_config(
            project_fixture.manager.project_state_backend,
            project_config_id,
        )
        prompt_impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            prompt_response.sectionId,
            PromptSectionImpl,
        )
        assert prompt_impl.template == "Hello there."
        assert prompt_impl.renderedText == "Hello there."
        assert prompt_impl.renderError is None


@pytest.mark.asyncio
async def test_route_delete_prompt_template_rejects_workflow_edge_references() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None

        start_response = await project_fixture.manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.StateMachineStart,
                position=Position(x=0, y=0),
            )
        )
        chat_response = await project_fixture.manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.Chat,
                position=Position(x=320, y=0),
            )
        )
        await project_fixture.manager.set_state_machine_section_settings(
            SetStateMachineSectionSettingsRequest(
                projectConfigId=project_config_id,
                sectionId=start_response.sectionId,
                machineGroupId="workflow-main",
                label="Workflow Start",
            )
        )
        prompt_template = PromptTemplate(
            id=ID("prompt-template-workflow"),
            name="Greeting",
            template="Hello there.",
        )
        save_prompt_template(project_fixture.dbe, prompt_template)
        await project_fixture.manager.create_state_machine_edge(
            CreateStateMachineEdgeRequest(
                projectConfigId=project_config_id,
                machineGroupId="workflow-main",
                sourceSectionId=start_response.sectionId,
                sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
                targetSectionId=chat_response.sectionId,
                targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
                targetAction=StateMachineTargetAction(
                    type=StateMachineTargetActionType.send_prompt,
                    promptTemplateId=prompt_template.id,
                    threadStrategy=StateMachineThreadStrategy.new_thread_before_send,
                ),
            )
        )
        state = _build_state(project_fixture, settings_fixture)

        with runtime_context(state) as ctx:
            with pytest.raises(HTTPException) as exc_info:
                await route_delete_prompt_template(
                    DeletePromptTemplateRequest(templateId=prompt_template.id),
                    ctx,
                )

        assert exc_info.value.status_code == 409
        assert str(prompt_template.id) in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_state_machine_edge_creation_rejects_missing_prompt_template_reference() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as _settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None

        start_response = await project_fixture.manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.StateMachineStart,
                position=Position(x=0, y=0),
            )
        )
        chat_response = await project_fixture.manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.Chat,
                position=Position(x=320, y=0),
            )
        )
        await project_fixture.manager.set_state_machine_section_settings(
            SetStateMachineSectionSettingsRequest(
                projectConfigId=project_config_id,
                sectionId=start_response.sectionId,
                machineGroupId="workflow-main",
                label="Workflow Start",
            )
        )

        with pytest.raises(KeyError, match="missing-template"):
            await project_fixture.manager.create_state_machine_edge(
                CreateStateMachineEdgeRequest(
                    projectConfigId=project_config_id,
                    machineGroupId="workflow-main",
                    sourceSectionId=start_response.sectionId,
                    sourcePortId=STATE_MACHINE_EDGE_SOURCE_PORT_ID,
                    targetSectionId=chat_response.sectionId,
                    targetPortId=STATE_MACHINE_EDGE_TARGET_PORT_ID,
                    targetAction=StateMachineTargetAction(
                        type=StateMachineTargetActionType.send_prompt,
                        promptTemplateId=ID("missing-template"),
                        threadStrategy=StateMachineThreadStrategy.new_thread_before_send,
                    ),
                )
            )


@pytest.mark.asyncio
async def test_route_set_prompt_template_link_rejects_unlink_when_linked_template_is_missing() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        project_config_id = (
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        assert project_config_id is not None

        prompt_response = await project_fixture.manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.Prompt,
                position=Position(),
            )
        )
        prompt_template = PromptTemplate(
            id=ID("prompt-template-broken-link"),
            name="Greeting",
            template="Hello there.",
        )
        save_prompt_template(project_fixture.dbe, prompt_template)
        state = _build_state(project_fixture, settings_fixture)

        with runtime_context(state) as ctx:
            await route_set_prompt_template_link(
                SetPromptTemplateLinkRequest(
                    projectConfigId=project_config_id,
                    sectionId=prompt_response.sectionId,
                    promptTemplateId=prompt_template.id,
                ),
                ctx,
            )
            delete_prompt_template(project_fixture.dbe, prompt_template.id)

            with pytest.raises(HTTPException) as exc_info:
                await route_set_prompt_template_link(
                    SetPromptTemplateLinkRequest(
                        projectConfigId=project_config_id,
                        sectionId=prompt_response.sectionId,
                        promptTemplateId=None,
                    ),
                    ctx,
                )

        assert exc_info.value.status_code == 404
        assert str(prompt_template.id) in str(exc_info.value.detail)
