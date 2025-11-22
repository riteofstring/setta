import asyncio
import json
import tempfile
import unittest
from pathlib import Path

from setta.database.db_objs import DBE
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.llm.config_store import (
    LLMConfig,
    LLMModelConfig,
    LLMProjectConfig,
    LLMProviderConfig,
    load_llm_config,
    resolve_model_selection,
    save_llm_config,
)
from setta.llm.config_test import test_llm_config
from setta.llm.config_watch import register_llm_config_watch
from setta.llm.models import (
    LLMRole,
    LLMTextBlock,
    MessageStartedEvent,
    ResponseCompletedEvent,
    TextDeltaEvent,
)
from setta.mcp.chat_manager import ChatManager
from setta.types.chat_messages import (
    ChatMessage,
    ChatStreamStatus,
    LLMModelSelection,
)
from setta.types.notifications import SettaNotificationType


class ProjectAwareSelectionTests(unittest.TestCase):
    def test_resolve_model_selection_prefers_project_scope(self) -> None:
        global_provider = LLMProviderConfig(
            provider_id="openai",
            display_name="Default OpenAI",
            models=[LLMModelConfig(model_id="gpt-4o", display_name="GPT-4o")],
        )
        scoped_provider = LLMProviderConfig(
            provider_id="openai",
            display_name="Project OpenAI",
            models=[LLMModelConfig(model_id="gpt-4o-mini", display_name="Mini")],
        )
        llm_config = LLMConfig(
            providers=[global_provider],
            project_configs={
                "proj-1": LLMProjectConfig(
                    project_config_id="proj-1",
                    providers=[scoped_provider],
                )
            },
        )
        selection = LLMModelSelection(providerId="openai", modelId="gpt-4o-mini")

        provider, model = resolve_model_selection(
            llm_config, selection, project_config_id="proj-1"
        )

        self.assertEqual(provider.display_name, "Project OpenAI")
        self.assertEqual(model.model_id, "gpt-4o-mini")

    def test_resolve_model_selection_uses_default_project_scope(self) -> None:
        scoped_provider = LLMProviderConfig(
            provider_id="anthropic",
            display_name="Scoped Anthropic",
            models=[LLMModelConfig(model_id="claude-3", display_name="Claude 3")],
        )
        llm_config = LLMConfig(
            default_project_config_id="proj-default",
            project_configs={
                "proj-default": LLMProjectConfig(
                    project_config_id="proj-default",
                    providers=[scoped_provider],
                )
            },
        )
        selection = LLMModelSelection(providerId="anthropic", modelId="claude-3")

        provider, model = resolve_model_selection(
            llm_config, selection, project_config_id=None
        )

        self.assertEqual(provider.display_name, "Scoped Anthropic")
        self.assertEqual(model.model_id, "claude-3")


class _RecordingFrontendSender:
    def __init__(self) -> None:
        self.notifications = []
        self.stream_chunks = []

    async def broadcast_notification(self, notification):
        self.notifications.append(notification)

    async def broadcast_llm_config(self, config):
        self.stream_chunks.append(config)

    async def send_streaming_response(
        self, chatId: str, assistant_message_id: str | None, chunk
    ):
        self.stream_chunks.append((chatId, assistant_message_id, chunk))


class _NullMCPClient:
    available_tools = None

    async def call_tool(self, name: str, arguments: dict):
        raise AssertionError(f"Unexpected tool call: {name}")


class _SlowChatManager(ChatManager):
    async def _astream_portkey_response(
        self,
        *,
        client,
        response_message_id: str,
        history,
        model: str,
        tools,
        request_params,
        extra_headers,
        provider_id: str,
    ):
        yield MessageStartedEvent(
            message_id=response_message_id,
            role=LLMRole.ASSISTANT,
        )
        while True:
            await asyncio.sleep(0.05)
            yield TextDeltaEvent(
                message_id=response_message_id, delta="tick", stream_target=None
            )

    def _acquire_portkey_client(self, provider, *, project_config_id):
        return object()


class ChatStopLifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def test_request_stop_streaming_emits_canceled_completion(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            dbe = DBE(Path(tmpdir))
            llm_config = LLMConfig(
                project_configs={
                    "proj-1": LLMProjectConfig(
                        project_config_id="proj-1",
                        providers=[
                            LLMProviderConfig(
                                provider_id="openai",
                                display_name="Project OpenAI",
                                models=[
                                    LLMModelConfig(
                                        model_id="gpt-4o", display_name="GPT-4o"
                                    )
                                ],
                            )
                        ],
                    )
                }
            )
            frontend = _RecordingFrontendSender()
            manager = _SlowChatManager(
                dbe,
                mcp_client=_NullMCPClient(),
                wmh_frontend_sender=frontend,
                llm_config=llm_config,
            )
            message = ChatMessage(
                role=LLMRole.USER,
                content=[LLMTextBlock(text="hello")],
            )
            selection = LLMModelSelection(providerId="openai", modelId="gpt-4o")
            chat = manager.get_or_create_chat(
                None,
                message,
                selection,
                "proj-1",
            )

            task = asyncio.create_task(
                manager.process_query("proj-1", chat, deep_think=False)
            )
            await asyncio.sleep(0.05)
            await manager.request_stop_streaming(chat.id)
            await task

            self.assertEqual(chat.streamStatus, ChatStreamStatus.CANCELED)
            self.assertFalse(manager.is_waiting_for_response(chat.id))
            persisted = manager.get_chat(chat.id)
            assert persisted is not None
            self.assertEqual(persisted.streamStatus, ChatStreamStatus.CANCELED)
            canceled_chunk = frontend.stream_chunks[-1][2]
            self.assertIsInstance(canceled_chunk, ResponseCompletedEvent)
            self.assertEqual(canceled_chunk.finish_reason, "canceled")


class LLMConfigWatcherTests(unittest.IsolatedAsyncioTestCase):
    async def test_invalid_llm_config_updates_surface_errors(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            config_path = Path(tmpdir) / "llm_config.json"
            db_path = Path(tmpdir) / "db"
            initial_config = LLMConfig(
                gateway_url="http://valid",
                providers=[
                    LLMProviderConfig(
                        provider_id="openai",
                        display_name="OpenAI",
                        models=[
                            LLMModelConfig(
                                model_id="gpt-4o",
                                display_name="GPT-4o",
                            )
                        ],
                    )
                ],
            )
            save_llm_config(initial_config, config_path=config_path)
            llm_config = load_llm_config(config_path=config_path)
            frontend = _RecordingFrontendSender()
            watcher = SpecificFileWatcher()
            manager = _SlowChatManager(
                DBE(db_path),
                mcp_client=_NullMCPClient(),
                wmh_frontend_sender=frontend,
                llm_config=llm_config,
            )

            register_llm_config_watch(
                frontend,
                watcher,
                llm_config,
                manager,
                config_path=config_path,
            )
            await asyncio.sleep(0.05)
            baseline_broadcasts = len(frontend.stream_chunks)
            self.assertGreaterEqual(baseline_broadcasts, 1)
            initial_gateway = llm_config.gateway_url

            config_path.parent.mkdir(parents=True, exist_ok=True)
            config_path.write_text("{", encoding="utf-8")
            watcher.request_read(config_path)
            await asyncio.sleep(0.05)

            self.assertEqual(llm_config.gateway_url, initial_gateway)
            self.assertEqual(len(frontend.stream_chunks), baseline_broadcasts)
            self.assertGreaterEqual(len(frontend.notifications), 1)
            self.assertEqual(
                frontend.notifications[-1].type, SettaNotificationType.error
            )
            self.assertIn("Keeping the previous LLM config", frontend.notifications[-1].message)

            invalid_payload = {"project_configs": {"proj-1": {"providers": "bad"}}}
            config_path.write_text(json.dumps(invalid_payload), encoding="utf-8")
            watcher.request_read(config_path)
            await asyncio.sleep(0.05)

            self.assertEqual(llm_config.gateway_url, initial_gateway)
            self.assertEqual(len(frontend.stream_chunks), baseline_broadcasts)
            self.assertGreaterEqual(len(frontend.notifications), 2)
            self.assertIn(
                "Invalid LLM config",
                frontend.notifications[-1].message,
            )


class ConfigValidationPayloadTests(unittest.TestCase):
    def test_provider_validation_reports_scope_and_missing_auth(self) -> None:
        config = LLMConfig(
            gateway_url="http://127.0.0.1:0",
            project_configs={
                "proj-1": LLMProjectConfig(
                    project_config_id="proj-1",
                    providers=[
                        LLMProviderConfig(
                            provider_id="openai",
                            display_name="Scoped OpenAI",
                            base_url="http://127.0.0.1:0",
                        )
                    ],
                )
            },
        )

        result = test_llm_config(config, timeout=0.01)

        scoped = next(
            provider
            for provider in result.providers
            if provider.project_config_id == "proj-1"
        )
        self.assertEqual(scoped.base_url, "http://127.0.0.1:0")
        self.assertFalse(scoped.ok)
        error_codes = [error.code for error in scoped.errors]
        self.assertIn("missing_authorization", error_codes)
        self.assertIn("request_failed", error_codes)


if __name__ == "__main__":
    unittest.main()
