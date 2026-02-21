from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

from setta.agentic.agentic_summary_cache import read_agentic_summary_cache
from setta.agentic.agentic_scope import AgenticContext, AgenticScope
from setta.agentic.store import create_agent_run, save_agent_run
from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.llm.agent_runner import AgentRunContext, AgentRunner
from setta.mcp.client import MultiMCPClient
from setta.types.agentic import AgentProfile, AgentRunStatus
from setta.types.agentic_edges import (
    AgenticEdge,
    AgenticEdgeContextMode,
    AgenticEdgeKind,
)
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import (
    create_agentic_edge,
    create_top_level_section,
    set_text_block_text,
)
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


def _build_dbe(tmpdir: str) -> DBE:
    root = Path(tmpdir) / "setta_files"
    root.mkdir(parents=True, exist_ok=True)
    return DBE(root)


class _StubUtilityCompletionAgentRunner(AgentRunner):
    def __init__(self, dbe: DBE) -> None:
        websocket_manager = WebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
        mcp_client = MultiMCPClient({}, disabled=True)
        super().__init__(dbe, mcp_client, frontend_sender)
        self.summary_calls = 0
        self.title_calls = 0

    async def _run_utility_completion(  # type: ignore[override]
        self,
        llm_config: LLMConfig,
        *,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
        temperature: float,
    ) -> str | None:
        del llm_config, user_prompt, max_tokens, temperature
        if system_prompt.startswith("You summarize content"):
            self.summary_calls += 1
            return "* summary bullet\n* second bullet"
        if system_prompt.startswith("You generate short chat titles"):
            self.title_calls += 1
            return '"Example title."'
        return None


def _build_llm_config() -> LLMConfig:
    return LLMConfig(
        id="primary",
        model="gpt-4o-mini",
        provider="openai",
        api_key_env="OPENAI_API_KEY",
        mcpServerIds=[],
    )


@pytest.mark.asyncio
async def test_agent_runner_generates_and_caches_agentic_section_summaries() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        runner = _StubUtilityCompletionAgentRunner(dbe)
        runner.update_config(AllLLMConfigs(configs={"primary": _build_llm_config()}))

        settings = SettingsState()
        project_state = ProjectStateSingleConfig(projectConfig=ProjectConfig(name="s"))
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
        set_text_block_text(project_state, context_section_id, "hello\nworld")
        create_agentic_edge(
            project_state,
            AgenticEdge(
                id=create_new_id(),
                sourceSectionId=context_section_id,
                targetSectionId=chat_section_id,
                kind=AgenticEdgeKind.section_chat,
                contextMode=AgenticEdgeContextMode.summary,
            ),
        )

        llm_config = _build_llm_config()
        first, summary_by_section, missing = await runner._resolve_agentic_summary_text_by_section_id(  # type: ignore[attr-defined]
            project_state,
            chat_section_id=chat_section_id,
            project_config_id=project_state.projectConfig.id,
            llm_config=llm_config,
        )
        assert first == {}
        assert missing == [context_section_id]
        assert runner.summary_calls == 0

        await runner._fill_agentic_summary_cache_for_chat_section(  # type: ignore[attr-defined]
            project_state,
            chat_section_id=chat_section_id,
            project_config_id=project_state.projectConfig.id,
            llm_config=llm_config,
            summary_by_section=summary_by_section,
            missing_section_ids=missing,
        )
        assert runner.summary_calls == 1

        # Second call should be served from cache without generating again.
        second, _summary_by_section, missing2 = await runner._resolve_agentic_summary_text_by_section_id(  # type: ignore[attr-defined]
            project_state,
            chat_section_id=chat_section_id,
            project_config_id=project_state.projectConfig.id,
            llm_config=llm_config,
        )
        assert second[context_section_id].startswith("- ")
        generated_summary = second[context_section_id]
        assert missing2 == []
        assert runner.summary_calls == 1

        third, _summary_by_section, missing3 = await runner._resolve_agentic_summary_text_by_section_id(  # type: ignore[attr-defined]
            project_state,
            chat_section_id=chat_section_id,
            project_config_id=project_state.projectConfig.id,
            llm_config=llm_config,
        )
        assert third[context_section_id] == generated_summary
        assert missing3 == []
        assert runner.summary_calls == 1

        cache_payload = read_agentic_summary_cache(dbe)
        assert cache_payload.get("entries")


@pytest.mark.asyncio
async def test_agent_runner_generates_and_reuses_chat_titles_across_runs() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        runner = _StubUtilityCompletionAgentRunner(dbe)
        runner.update_config(AllLLMConfigs(configs={"primary": _build_llm_config()}))

        chat_id = ID("chat-1")
        project_config_id = ID("project-1")
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(id=project_config_id, name="project-1")
        )
        llm_config = _build_llm_config()
        profile = AgentProfile(
            name="Managed chat",
            engineConfigId=ID("engine-1"),
            enableLlmChatTitles=True,
        )
        messages = [UserChatMessage(content=[MessageTextContent(text="Hello world")])]

        run1_inputs = {
            "runType": "llm_chat",
            "chatId": str(chat_id),
            "projectConfigId": str(project_config_id),
        }
        run1 = create_agent_run(profile_id=None, inputs=run1_inputs)
        outputs1: dict[str, object] = {}
        context1 = AgentRunContext(
            run=run1,
            profile=profile,
            llm_config=llm_config,
            engine_config_id=ID("engine-1"),
            project_config_id=project_config_id,
            project_state=project_state,
            chat_id=chat_id,
            section_id=None,
            thinking=False,
            system_prompt="",
            allowlist=None,
            agentic_scope=AgenticScope(),
            agentic_context=AgenticContext(
                project_config_id=project_config_id,
                chat_id=chat_id,
                section_id=None,
            ),
            setta_tool_approval_policy=None,
            context_payload=None,
            emit_stream=False,
            emit_ai_follow=False,
        )
        await runner._apply_chat_title_to_outputs(  # type: ignore[attr-defined]
            context1,
            messages=messages,
            outputs=outputs1,  # type: ignore[arg-type]
            allow_llm=True,
        )
        assert outputs1["name"] == "Example title"
        assert "nameInputHash" in outputs1
        assert outputs1["nameSource"] == "llm"
        assert runner.title_calls == 1

        run1.outputs = dict(outputs1)  # type: ignore[arg-type]
        run1.status = AgentRunStatus.completed
        save_agent_run(dbe, run1)

        run2_inputs = dict(run1_inputs)
        run2 = create_agent_run(profile_id=None, inputs=run2_inputs)
        outputs2: dict[str, object] = {}
        context2 = AgentRunContext(
            **{
                **context1.__dict__,
                "run": run2,
            }
        )
        await runner._apply_chat_title_to_outputs(  # type: ignore[attr-defined]
            context2,
            messages=messages,
            outputs=outputs2,  # type: ignore[arg-type]
            allow_llm=True,
        )
        assert outputs2["name"] == outputs1["name"]
        assert outputs2["nameInputHash"] == outputs1["nameInputHash"]
        assert outputs2["nameSource"] == "reused"
        assert runner.title_calls == 1


@pytest.mark.asyncio
async def test_agent_runner_sets_deterministic_chat_title_when_llm_disabled() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        runner = _StubUtilityCompletionAgentRunner(dbe)
        runner.update_config(AllLLMConfigs(configs={"primary": _build_llm_config()}))

        chat_id = ID("chat-2")
        project_config_id = ID("project-2")
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(id=project_config_id, name="project-2")
        )
        llm_config = _build_llm_config()
        profile = AgentProfile(
            name="Managed chat",
            engineConfigId=ID("engine-1"),
        )
        messages = [UserChatMessage(content=[MessageTextContent(text="Hello world")])]

        run_inputs = {
            "runType": "llm_chat",
            "chatId": str(chat_id),
            "projectConfigId": str(project_config_id),
        }
        run = create_agent_run(profile_id=None, inputs=run_inputs)
        outputs: dict[str, object] = {}
        context = AgentRunContext(
            run=run,
            profile=profile,
            llm_config=llm_config,
            engine_config_id=ID("engine-1"),
            project_config_id=project_config_id,
            project_state=project_state,
            chat_id=chat_id,
            section_id=None,
            thinking=False,
            system_prompt="",
            allowlist=None,
            agentic_scope=AgenticScope(),
            agentic_context=AgenticContext(
                project_config_id=project_config_id,
                chat_id=chat_id,
                section_id=None,
            ),
            setta_tool_approval_policy=None,
            context_payload=None,
            emit_stream=False,
            emit_ai_follow=False,
        )
        await runner._apply_chat_title_to_outputs(  # type: ignore[attr-defined]
            context,
            messages=messages,
            outputs=outputs,  # type: ignore[arg-type]
            allow_llm=False,
        )
        assert outputs["name"] == "Hello world"
        assert outputs["nameSource"] == "deterministic"
        assert runner.title_calls == 0
