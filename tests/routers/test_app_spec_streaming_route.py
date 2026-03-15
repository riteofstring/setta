import json
from dataclasses import dataclass

from fastapi.responses import JSONResponse, StreamingResponse
import pytest

from setta.routers.app_spec_streaming import StreamAppSpecRequest, route_stream_app_spec
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from tests.utils.runtime_context import runtime_context


@dataclass(slots=True)
class _AgentRunnerStub:
    config: AllLLMConfigs
    api_keys: dict[str, str]
    disabled: bool = False


@dataclass(slots=True)
class _StateStub:
    agent_runner: _AgentRunnerStub
    wmh_frontend_sender: object
    share_mode: bool = False
    deployment_mode: bool = False


class TestAppSpecStreamingRoute:
    pytestmark = pytest.mark.asyncio

    async def test_returns_message_when_no_llm_config_available(self) -> None:
        state = _StateStub(
            agent_runner=_AgentRunnerStub(config=AllLLMConfigs(), api_keys={}),
            wmh_frontend_sender=object(),
        )

        with runtime_context(state) as ctx:
            response = await route_stream_app_spec(
                StreamAppSpecRequest(prompt="Build a minimal app"),
                ctx,
            )

        assert isinstance(response, JSONResponse)
        assert response.status_code == 400
        payload = json.loads(response.body.decode("utf-8"))
        assert payload["message"].startswith("No LLM config available")

    async def test_returns_message_for_empty_prompt(self) -> None:
        state = _StateStub(
            agent_runner=_AgentRunnerStub(
                config=AllLLMConfigs(
                    configs={
                        "primary": LLMConfig(
                            id="primary",
                            model="gpt-4o-mini",
                        )
                    }
                ),
                api_keys={},
            ),
            wmh_frontend_sender=object(),
        )

        with runtime_context(state) as ctx:
            response = await route_stream_app_spec(
                StreamAppSpecRequest(prompt="   "),
                ctx,
            )

        assert isinstance(response, JSONResponse)
        assert response.status_code == 400
        payload = json.loads(response.body.decode("utf-8"))
        assert payload["message"] == "Prompt must be non-empty."

    async def test_rejects_non_json_serializable_current_spec(self) -> None:
        state = _StateStub(
            agent_runner=_AgentRunnerStub(
                config=AllLLMConfigs(
                    configs={
                        "primary": LLMConfig(
                            id="primary",
                            model="gpt-4o-mini",
                        )
                    }
                ),
                api_keys={},
            ),
            wmh_frontend_sender=object(),
        )

        with runtime_context(state) as ctx:
            response = await route_stream_app_spec(
                StreamAppSpecRequest(
                    prompt="Build a minimal app",
                    currentSpec={"bad": object()},
                ),
                ctx,
            )

        assert isinstance(response, JSONResponse)
        assert response.status_code == 400
        payload = json.loads(response.body.decode("utf-8"))
        assert payload["message"].startswith("currentSpec must be JSON-serializable:")

    async def test_rejects_large_current_spec(self) -> None:
        state = _StateStub(
            agent_runner=_AgentRunnerStub(
                config=AllLLMConfigs(
                    configs={
                        "primary": LLMConfig(
                            id="primary",
                            model="gpt-4o-mini",
                        )
                    }
                ),
                api_keys={},
            ),
            wmh_frontend_sender=object(),
        )

        with runtime_context(state) as ctx:
            response = await route_stream_app_spec(
                StreamAppSpecRequest(
                    prompt="Build a minimal app",
                    currentSpec="a" * 50_001,
                ),
                ctx,
            )

        assert isinstance(response, JSONResponse)
        assert response.status_code == 400
        payload = json.loads(response.body.decode("utf-8"))
        assert payload["message"] == "currentSpec is too large. Reduce it or omit it."

    async def test_rejects_large_catalog_summary(self) -> None:
        state = _StateStub(
            agent_runner=_AgentRunnerStub(
                config=AllLLMConfigs(
                    configs={
                        "primary": LLMConfig(
                            id="primary",
                            model="gpt-4o-mini",
                        )
                    }
                ),
                api_keys={},
            ),
            wmh_frontend_sender=object(),
        )

        with runtime_context(state) as ctx:
            response = await route_stream_app_spec(
                StreamAppSpecRequest(
                    prompt="Build a minimal app",
                    context={"catalogSummary": "a" * 100_001},
                ),
                ctx,
            )

        assert isinstance(response, JSONResponse)
        assert response.status_code == 400
        payload = json.loads(response.body.decode("utf-8"))
        assert (
            payload["message"] == "catalogSummary is too large. Reduce it or omit it."
        )

    async def test_rejects_large_sections_summary(self) -> None:
        state = _StateStub(
            agent_runner=_AgentRunnerStub(
                config=AllLLMConfigs(
                    configs={
                        "primary": LLMConfig(
                            id="primary",
                            model="gpt-4o-mini",
                        )
                    }
                ),
                api_keys={},
            ),
            wmh_frontend_sender=object(),
        )

        with runtime_context(state) as ctx:
            response = await route_stream_app_spec(
                StreamAppSpecRequest(
                    prompt="Build a minimal app",
                    context={"sectionsSummary": "a" * 100_001},
                ),
                ctx,
            )

        assert isinstance(response, JSONResponse)
        assert response.status_code == 400
        payload = json.loads(response.body.decode("utf-8"))
        assert (
            payload["message"] == "sectionsSummary is too large. Reduce it or omit it."
        )

    async def test_rejects_large_reference_image_url(self) -> None:
        state = _StateStub(
            agent_runner=_AgentRunnerStub(
                config=AllLLMConfigs(
                    configs={
                        "primary": LLMConfig(
                            id="primary",
                            model="gpt-4o-mini",
                        )
                    }
                ),
                api_keys={},
            ),
            wmh_frontend_sender=object(),
        )

        with runtime_context(state) as ctx:
            response = await route_stream_app_spec(
                StreamAppSpecRequest(
                    prompt="Build a minimal app",
                    referenceImageUrl="h" * 4097,
                ),
                ctx,
            )

        assert isinstance(response, JSONResponse)
        assert response.status_code == 400
        payload = json.loads(response.body.decode("utf-8"))
        assert (
            payload["message"]
            == "referenceImageUrl is too large. Reduce it or omit it."
        )

    async def test_rejects_large_reference_image_notes(self) -> None:
        state = _StateStub(
            agent_runner=_AgentRunnerStub(
                config=AllLLMConfigs(
                    configs={
                        "primary": LLMConfig(
                            id="primary",
                            model="gpt-4o-mini",
                        )
                    }
                ),
                api_keys={},
            ),
            wmh_frontend_sender=object(),
        )

        with runtime_context(state) as ctx:
            response = await route_stream_app_spec(
                StreamAppSpecRequest(
                    prompt="Build a minimal app",
                    referenceImageNotes="n" * 100_001,
                ),
                ctx,
            )

        assert isinstance(response, JSONResponse)
        assert response.status_code == 400
        payload = json.loads(response.body.decode("utf-8"))
        assert payload["message"] == (
            "referenceImageNotes is too large. Reduce it or omit it."
        )

    async def test_rejects_image_mode_when_model_lacks_vision_support(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        state = _StateStub(
            agent_runner=_AgentRunnerStub(
                config=AllLLMConfigs(
                    configs={
                        "primary": LLMConfig(
                            id="primary",
                            model="text-only-model",
                        )
                    }
                ),
                api_keys={},
            ),
            wmh_frontend_sender=object(),
        )
        litellm_called = False

        async def _fake_acompletion(**_: object):
            nonlocal litellm_called
            litellm_called = True
            raise AssertionError("litellm.acompletion should not be reached")

        monkeypatch.setattr(
            "setta.routers.app_spec_streaming._supports_vision",
            lambda **_: False,
        )
        monkeypatch.setattr("setta.routers.app_spec_streaming.litellm.acompletion", _fake_acompletion)

        with runtime_context(state) as ctx:
            response = await route_stream_app_spec(
                StreamAppSpecRequest(
                    prompt="Build from image",
                    mode="json_render_with_image",
                    referenceImageUrl="https://example.com/ui.png",
                ),
                ctx,
            )

        assert isinstance(response, JSONResponse)
        assert response.status_code == 400
        payload = json.loads(response.body.decode("utf-8"))
        assert "does not support image inputs" in payload["message"]
        assert litellm_called is False

    async def test_ignores_reference_image_payload_outside_image_mode(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        state = _StateStub(
            agent_runner=_AgentRunnerStub(
                config=AllLLMConfigs(
                    configs={
                        "primary": LLMConfig(
                            id="primary",
                            model="gpt-4o-mini",
                        )
                    }
                ),
                api_keys={},
            ),
            wmh_frontend_sender=object(),
        )
        captured_messages: list[dict[str, object]] = []

        async def _fake_acompletion(**kwargs: object):
            nonlocal captured_messages
            raw_messages = kwargs.get("messages")
            if not isinstance(raw_messages, list):
                raise AssertionError("Expected messages list in LLM payload")
            captured_messages = raw_messages

            async def _iter():
                if False:
                    yield None

            return _iter()

        monkeypatch.setattr("setta.routers.app_spec_streaming.litellm.acompletion", _fake_acompletion)

        with runtime_context(state) as ctx:
            response = await route_stream_app_spec(
                StreamAppSpecRequest(
                    prompt="Build without image mode",
                    mode="json_render",
                    referenceImageUrl="https://example.com/stale.png",
                    referenceImageNotes="Should be ignored in json_render.",
                ),
                ctx,
            )

        assert isinstance(response, StreamingResponse)
        assert len(captured_messages) == 2
        user_payload = captured_messages[1]
        assert user_payload.get("role") == "user"
        assert user_payload.get("content") == "Build without image mode"
