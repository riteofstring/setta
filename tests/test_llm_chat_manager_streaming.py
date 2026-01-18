import unittest
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory

from litellm.types.utils import Delta
from litellm.utils import supports_prompt_caching

from setta.database.db_objs import DBE
from setta.llm.agent_runner import AgentRunner
from setta.llm.chat_toolkit.managed.stream_assembler import StreamContentEntry
from setta.mcp.client import MultiMCPClient
from setta.types.agentic import AgentProfile
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    ToolChatMessage,
    UserChatMessage,
)
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


@contextmanager
def _runner_context() -> Iterator[AgentRunner]:
    with TemporaryDirectory() as temp_dir:
        dbe = DBE(Path(temp_dir))
        websocket_manager = WebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        runner = AgentRunner(dbe, MultiMCPClient({}), frontend_sender)
        yield runner


@contextmanager
def _build_runner_and_messages(
    *,
    other_params: dict[str, object] | None = None,
    model: str = "gpt-4o",
    provider: str | None = None,
) -> Iterator[tuple[AgentRunner, LLMConfig, str, list, ID]]:
    with TemporaryDirectory() as temp_dir:
        dbe = DBE(Path(temp_dir))
        websocket_manager = WebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        runner = AgentRunner(dbe, MultiMCPClient({}), frontend_sender)
        llm_config = LLMConfig(
            id="provider-one",
            model=model,
            provider=provider,
            other_params=other_params,
        )
        runner.update_config(AllLLMConfigs(configs={llm_config.id: llm_config}))
        active_project_config_id = ID("project-uuid")
        profile = AgentProfile(name="Test Agent", description="", systemPrompt="")
        system_prompt = runner._build_system_prompt(profile, active_project_config_id)
        messages = [
            UserChatMessage(content=[MessageTextContent(text="Hello from the user")])
        ]
        yield runner, llm_config, system_prompt, messages, active_project_config_id


class StreamEntryFallbackTests(unittest.TestCase):
    def test_primary_thinking_chunk_suppresses_fallback(self) -> None:
        with _runner_context() as runner:
            delta = Delta(
                content=[{"type": "thinking", "thinking": "primary"}],
                reasoning_content="fallback",
            )

            entries = runner._collect_stream_entries(delta)

            self.assertEqual(len(entries), 1)
            self.assertEqual(
                entries[0], StreamContentEntry("thinking", "primary", None)
            )

    def test_empty_thinking_chunk_allows_reasoning_fallback(self) -> None:
        with _runner_context() as runner:
            delta = Delta(
                content=[{"type": "thinking", "thinking": None}],
                reasoning_content="fallback",
            )

            entries = runner._collect_stream_entries(delta)

            self.assertGreaterEqual(len(entries), 1)
            self.assertEqual(
                entries[0], StreamContentEntry("thinking", "fallback", None)
            )

    def test_provider_specific_thinking_blocks_are_used(self) -> None:
        with _runner_context() as runner:
            delta = Delta(
                content=None,
                reasoning_content=None,
                provider_specific_fields={"thinking_blocks": [{"thinking": "details"}]},
            )

            entries = runner._collect_stream_entries(delta)

            self.assertEqual(
                entries, [StreamContentEntry("thinking", "details", None)]
            )


class SystemPromptInjectionTests(unittest.TestCase):
    def test_payload_includes_system_prompt_before_chat_history(self) -> None:
        with _build_runner_and_messages() as (
            runner,
            llm_config,
            system_prompt,
            messages,
            active_project_config_id,
        ):
            payload = runner._build_llm_request_payload(
                llm_config=llm_config,
                messages=messages,
                deep_think=False,
                system_prompt=system_prompt,
                allowlist=None,
            )

            self.assertEqual(payload["messages"][0]["role"], "system")
            system_text = payload["messages"][0]["content"][0]["text"]
            self.assertTrue(system_text.startswith(runner.system_prompt))
            self.assertIn("## Active project config", system_text)
            _, canonical_to_temporary = runner.dbe.read_temporary_id_map()
            if active_project_config_id not in canonical_to_temporary:
                raise AssertionError("Expected project config ID in temporary map")
            temporary_project_id = canonical_to_temporary[active_project_config_id]
            self.assertIn(str(temporary_project_id), system_text)
            self.assertEqual(payload["messages"][1]["role"], "user")
            self.assertEqual(
                payload["messages"][1]["content"][0]["text"],
                "Hello from the user",
            )


class CachePromptingTests(unittest.TestCase):
    def test_cache_prompting_matches_support_signal(self) -> None:
        with _build_runner_and_messages() as (
            runner,
            llm_config,
            system_prompt,
            messages,
            _active_project_config_id,
        ):
            supports_cache = supports_prompt_caching(
                model=llm_config.model,
                custom_llm_provider=llm_config.provider,
            )
            payload = runner._build_llm_request_payload(
                llm_config=llm_config,
                messages=messages,
                deep_think=False,
                system_prompt=system_prompt,
                allowlist=None,
            )

            if supports_cache:
                self.assertEqual(
                    payload.get("cache_control_injection_points"),
                    [
                        {"location": "message", "role": "system"},
                        {"location": "message", "index": -1},
                    ],
                )
            else:
                self.assertNotIn("cache_control_injection_points", payload)

    def test_existing_cache_prompting_configuration_is_preserved(self) -> None:
        with _build_runner_and_messages(
            other_params={
                "cache_control_injection_points": [
                    {"location": "message", "role": "user"}
                ]
            }
        ) as (runner, llm_config, system_prompt, messages, _active_project_config_id):
            payload = runner._build_llm_request_payload(
                llm_config=llm_config,
                messages=messages,
                deep_think=False,
                system_prompt=system_prompt,
                allowlist=None,
            )

            self.assertEqual(
                payload["cache_control_injection_points"],
                [{"location": "message", "role": "user"}],
            )

    def test_cache_prompting_with_tool_messages(self) -> None:
        with _build_runner_and_messages() as (
            runner,
            llm_config,
            system_prompt,
            messages,
            _active_project_config_id,
        ):
            messages = [
                UserChatMessage(content=[MessageTextContent(text="First question")]),
                AssistantChatMessage(
                    content=[MessageTextContent(text="First reply")]
                ),
                ToolChatMessage(tool_call_id="tool-call-id"),
                UserChatMessage(content=[MessageTextContent(text="Second question")]),
            ]
            supports_cache = supports_prompt_caching(
                model=llm_config.model,
                custom_llm_provider=llm_config.provider,
            )
            payload = runner._build_llm_request_payload(
                llm_config=llm_config,
                messages=messages,
                deep_think=False,
                system_prompt=system_prompt,
                allowlist=None,
            )

            if supports_cache:
                self.assertEqual(
                    payload.get("cache_control_injection_points"),
                    [
                        {"location": "message", "role": "system"},
                        {"location": "message", "index": -1},
                    ],
                )
            else:
                self.assertNotIn("cache_control_injection_points", payload)


if __name__ == "__main__":
    unittest.main()
