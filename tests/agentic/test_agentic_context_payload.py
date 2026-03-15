from pathlib import Path

import pytest

from setta.agentic.agentic_context import build_agentic_context_payload
from setta.agentic.store import (
    delete_prompt_template,
    save_engine_configs,
    save_prompt_template,
)
from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.llm.config import load_llm_config, save_llm_config
from setta.types.agentic import EngineConfig, EngineType
from setta.types.agentic_edges import (
    AgenticEdge,
    AgenticEdgeContextMode,
    AgenticEdgeKind,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import (
    create_agentic_edge,
    create_top_level_section,
    set_chat_section_settings,
    set_prompt_section_template_link,
    set_text_block_text,
)
from setta.types.id import ID
from setta.types.project_config import Position, ProjectConfig
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from setta.types.prompt import PromptTemplate
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import (
    ChatDictationMode,
    ChatPermissionMode,
    SectionType,
)

from tests.types.test_helpers_lvl2 import build_callable_project_state


def _build_context_inputs(tmp_path: Path):
    dbe = DBE(tmp_path / "setta_files")
    save_llm_config(
        AllLLMConfigs(
            configs={
                "primary": LLMConfig(
                    id="primary",
                    model="claude-3-7-sonnet-latest",
                    provider="anthropic",
                )
            },
            default_config_id="primary",
        ),
        dbe,
    )
    return dbe, load_llm_config(dbe, allow_write=False)


def _make_linked_chat_executable(
    dbe: DBE,
    project_state: ProjectStateSingleConfig,
    section_id: ID,
    *,
    engine_config_id: ID = ID("engine-linked"),
) -> None:
    save_engine_configs(
        dbe,
        [
            EngineConfig(
                id=engine_config_id,
                name="Linked Engine",
                engineType=EngineType.setta_llm,
                settaLlmConfigId="primary",
            )
        ],
    )
    set_chat_section_settings(
        project_state,
        section_id,
        True,
        engine_config_id,
        None,
        None,
        False,
        ChatPermissionMode.minimal,
        True,
        ChatDictationMode.auto,
    )


def test_build_agentic_context_payload_uses_formatter_for_ids(tmp_path: Path) -> None:
    dbe, llm_configs = _build_context_inputs(tmp_path)
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="agentic-context-payload-test")
    )
    chat_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chat,
        Position(),
    )
    context_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.TextBlock,
        Position(),
    )
    create_agentic_edge(
        project_state,
        AgenticEdge(
            id=create_new_id(),
            sourceSectionId=chat_section_id,
            targetSectionId=context_section_id,
            kind=AgenticEdgeKind.chat_section,
            contextMode=AgenticEdgeContextMode.reference_only,
        ),
    )

    payload = build_agentic_context_payload(
        dbe,
        project_state,
        chat_section_id,
        llm_configs=llm_configs,
        format_section_id=lambda _section_id: "TEMP-ID",
    )

    assert "TEMP-ID" in payload.text
    assert str(context_section_id) not in payload.text
    assert payload.section_ids == [ID(context_section_id)]


def test_build_agentic_context_payload_includes_inline_text_with_truncation(
    tmp_path: Path,
) -> None:
    dbe, llm_configs = _build_context_inputs(tmp_path)
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="agentic-context-inline-test")
    )
    chat_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chat,
        Position(),
    )
    context_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.TextBlock,
        Position(),
    )
    long_text = "\n".join(f"line {idx}" for idx in range(200))
    set_text_block_text(project_state, context_section_id, long_text)
    create_agentic_edge(
        project_state,
        AgenticEdge(
            id=create_new_id(),
            sourceSectionId=chat_section_id,
            targetSectionId=context_section_id,
            kind=AgenticEdgeKind.chat_section,
            contextMode=AgenticEdgeContextMode.inline_text,
        ),
    )

    payload = build_agentic_context_payload(
        dbe,
        project_state,
        chat_section_id,
        llm_configs=llm_configs,
    )

    assert payload.section_ids == [ID(context_section_id)]
    assert "## Agentic Context" in payload.text
    assert f"[id: {context_section_id} | inline]" in payload.text
    assert "... (40 more lines)" in payload.text


def test_build_agentic_context_payload_summary_mode_uses_tighter_truncation(
    tmp_path: Path,
) -> None:
    dbe, llm_configs = _build_context_inputs(tmp_path)
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="agentic-context-summary-test")
    )
    chat_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chat,
        Position(),
    )
    context_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.TextBlock,
        Position(),
    )
    long_text = "\n".join(f"line {idx}" for idx in range(200))
    set_text_block_text(project_state, context_section_id, long_text)
    create_agentic_edge(
        project_state,
        AgenticEdge(
            id=create_new_id(),
            sourceSectionId=chat_section_id,
            targetSectionId=context_section_id,
            kind=AgenticEdgeKind.chat_section,
            contextMode=AgenticEdgeContextMode.summary,
        ),
    )

    payload = build_agentic_context_payload(
        dbe,
        project_state,
        chat_section_id,
        llm_configs=llm_configs,
    )

    assert payload.section_ids == [ID(context_section_id)]
    assert f"[id: {context_section_id} | summary | fallback]" in payload.text
    assert "... (168 more lines)" in payload.text


def test_build_agentic_context_payload_uses_live_linked_prompt_template_text(
    tmp_path: Path,
) -> None:
    # Linked prompt sections should resolve the current saved template text,
    # not a stale snapshot copied into the section when the link was created.
    dbe, llm_configs = _build_context_inputs(tmp_path)
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="agentic-context-linked-prompt-test")
    )
    chat_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chat,
        Position(),
    )
    prompt_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Prompt,
        Position(),
    )
    prompt_template = PromptTemplate(
        id=ID("prompt-template-context"),
        name="Greeting",
        template="Hello from the saved template.",
    )
    save_prompt_template(dbe, prompt_template)
    set_prompt_section_template_link(
        project_state,
        prompt_section_id,
        prompt_template.id,
        "stale prompt snapshot",
        prompt_template.format,
    )
    save_prompt_template(
        dbe,
        PromptTemplate(
            id=prompt_template.id,
            name=prompt_template.name,
            template="Hello from the updated saved template.",
            format=prompt_template.format,
        ),
    )
    create_agentic_edge(
        project_state,
        AgenticEdge(
            id=create_new_id(),
            sourceSectionId=chat_section_id,
            targetSectionId=prompt_section_id,
            kind=AgenticEdgeKind.chat_section,
            contextMode=AgenticEdgeContextMode.inline_text,
        ),
    )

    payload = build_agentic_context_payload(
        dbe,
        project_state,
        chat_section_id,
        llm_configs=llm_configs,
    )

    assert payload.section_ids == [ID(prompt_section_id)]
    assert "Hello from the updated saved template." in payload.text
    assert "stale prompt snapshot" not in payload.text


def test_build_agentic_context_payload_raises_when_linked_template_is_missing(
    tmp_path: Path,
) -> None:
    dbe, llm_configs = _build_context_inputs(tmp_path)
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="agentic-context-missing-linked-prompt-test")
    )
    chat_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chat,
        Position(),
    )
    prompt_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Prompt,
        Position(),
    )
    prompt_template = PromptTemplate(
        id=ID("prompt-template-missing-context"),
        name="Greeting",
        template="Hello from the saved template.",
    )
    save_prompt_template(dbe, prompt_template)
    set_prompt_section_template_link(
        project_state,
        prompt_section_id,
        prompt_template.id,
        "stale prompt snapshot",
        prompt_template.format,
    )
    create_agentic_edge(
        project_state,
        AgenticEdge(
            id=create_new_id(),
            sourceSectionId=chat_section_id,
            targetSectionId=prompt_section_id,
            kind=AgenticEdgeKind.chat_section,
            contextMode=AgenticEdgeContextMode.inline_text,
        ),
    )
    delete_prompt_template(dbe, prompt_template.id)

    with pytest.raises(KeyError, match=str(prompt_template.id)):
        build_agentic_context_payload(
            dbe,
            project_state,
            chat_section_id,
            llm_configs=llm_configs,
        )


def test_build_agentic_context_payload_reference_only_omits_section_body(
    tmp_path: Path,
) -> None:
    dbe, llm_configs = _build_context_inputs(tmp_path)
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="agentic-context-reference-only-test")
    )
    chat_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chat,
        Position(),
    )
    context_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.TextBlock,
        Position(),
    )
    set_text_block_text(project_state, context_section_id, "hello")
    create_agentic_edge(
        project_state,
        AgenticEdge(
            id=create_new_id(),
            sourceSectionId=chat_section_id,
            targetSectionId=context_section_id,
            kind=AgenticEdgeKind.chat_section,
            contextMode=AgenticEdgeContextMode.reference_only,
        ),
    )

    payload = build_agentic_context_payload(
        dbe,
        project_state,
        chat_section_id,
        llm_configs=llm_configs,
    )

    assert payload.section_ids == [ID(context_section_id)]
    assert f"[id: {context_section_id}]" in payload.text
    assert "### " not in payload.text


def test_build_agentic_context_payload_summary_mode_uses_cached_summary_when_available(
    tmp_path: Path,
) -> None:
    dbe, llm_configs = _build_context_inputs(tmp_path)
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="agentic-context-summary-cache-test")
    )
    chat_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chat,
        Position(),
    )
    context_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.TextBlock,
        Position(),
    )
    long_text = "\n".join(f"line {idx}" for idx in range(200))
    set_text_block_text(project_state, context_section_id, long_text)
    create_agentic_edge(
        project_state,
        AgenticEdge(
            id=create_new_id(),
            sourceSectionId=chat_section_id,
            targetSectionId=context_section_id,
            kind=AgenticEdgeKind.chat_section,
            contextMode=AgenticEdgeContextMode.summary,
        ),
    )

    payload = build_agentic_context_payload(
        dbe,
        project_state,
        chat_section_id,
        llm_configs=llm_configs,
        summary_text_by_section_id={ID(context_section_id): "- cached summary bullet"},
    )

    assert payload.section_ids == [ID(context_section_id)]
    assert f"[id: {context_section_id} | summary | cached]" in payload.text
    assert "- cached summary bullet" in payload.text
    assert "... (168 more lines)" not in payload.text


def test_build_agentic_context_payload_merges_missing_summary_sections_when_map_is_partial(
    tmp_path: Path,
) -> None:
    dbe, llm_configs = _build_context_inputs(tmp_path)
    project_state, callable_section_id, _ = build_callable_project_state("hello")
    settings = SettingsState()
    chat_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chat,
        Position(),
    )
    create_agentic_edge(
        project_state,
        AgenticEdge(
            id=create_new_id(),
            sourceSectionId=chat_section_id,
            targetSectionId=callable_section_id,
            kind=AgenticEdgeKind.chat_section,
            contextMode=AgenticEdgeContextMode.inline_text,
        ),
    )

    payload = build_agentic_context_payload(
        dbe,
        project_state,
        chat_section_id,
        llm_configs=llm_configs,
        summary_by_section={},
    )

    assert payload.section_ids == [ID(callable_section_id)]
    assert "- param: hello" in payload.text


def test_build_agentic_context_payload_includes_linked_chat_targets(
    tmp_path: Path,
) -> None:
    dbe, llm_configs = _build_context_inputs(tmp_path)
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="agentic-context-linked-chat-test")
    )
    chat_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chat,
        Position(),
    )
    linked_chat_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chat,
        Position(),
    )
    project_state.sections[linked_chat_section_id].displayName = "Planner"
    _make_linked_chat_executable(dbe, project_state, linked_chat_section_id)
    create_agentic_edge(
        project_state,
        AgenticEdge(
            id=create_new_id(),
            sourceSectionId=chat_section_id,
            targetSectionId=linked_chat_section_id,
            kind=AgenticEdgeKind.chat_chat,
            contextMode=AgenticEdgeContextMode.reference_only,
        ),
    )

    payload = build_agentic_context_payload(
        dbe,
        project_state,
        chat_section_id,
        llm_configs=llm_configs,
        format_section_id=lambda _section_id: "TEMP-LINKED-CHAT",
    )

    assert payload.section_ids == [ID(linked_chat_section_id)]
    assert "## Linked Chats" in payload.text
    assert "`invoke_linked_chat`" in payload.text
    assert "Planner [id: TEMP-LINKED-CHAT]" in payload.text


def test_build_agentic_context_payload_omits_non_executable_linked_chat_targets(
    tmp_path: Path,
) -> None:
    # Context discovery should only advertise linked chats that can actually run.
    dbe, llm_configs = _build_context_inputs(tmp_path)
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="agentic-context-linked-chat-filter-test")
    )
    chat_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chat,
        Position(),
    )
    valid_linked_chat_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chat,
        Position(),
    )
    invalid_linked_chat_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chat,
        Position(),
    )
    project_state.sections[valid_linked_chat_id].displayName = "Planner"
    project_state.sections[invalid_linked_chat_id].displayName = "Scriptable"
    _make_linked_chat_executable(dbe, project_state, valid_linked_chat_id)
    create_agentic_edge(
        project_state,
        AgenticEdge(
            id=create_new_id(),
            sourceSectionId=chat_section_id,
            targetSectionId=valid_linked_chat_id,
            kind=AgenticEdgeKind.chat_chat,
        ),
    )
    create_agentic_edge(
        project_state,
        AgenticEdge(
            id=create_new_id(),
            sourceSectionId=chat_section_id,
            targetSectionId=invalid_linked_chat_id,
            kind=AgenticEdgeKind.chat_chat,
        ),
    )

    payload = build_agentic_context_payload(
        dbe,
        project_state,
        chat_section_id,
        llm_configs=llm_configs,
    )

    assert payload.section_ids == [ID(valid_linked_chat_id)]
    assert "Planner" in payload.text
    assert "Scriptable" not in payload.text
