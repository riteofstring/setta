import json
from dataclasses import dataclass

from fastapi.responses import JSONResponse
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
