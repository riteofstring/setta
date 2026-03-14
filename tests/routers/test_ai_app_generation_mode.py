from fastapi import HTTPException
import pytest

from setta.types.generated.chat_messages import UserChatMessage

from setta.routers.ai import (
    _build_app_generation_mode_prompt,
    _get_run_app_generation_by_message_id,
    _normalize_app_generation_by_message_id,
    _require_image_attachment_for_app_generation_mode,
)
from setta.types.agentic import AgentRun


class TestAIAppGenerationModeHelpers:
    """Unit tests for app-generation routing helpers in AI routes."""

    def test_build_prompt_uses_single_non_streaming_contract(self) -> None:
        prompt = _build_app_generation_mode_prompt(mode="json_render_with_image")
        if prompt is None:
            raise AssertionError("Expected an app-generation mode prompt")
        assert "mode: json_render_with_image" in prompt
        assert "setta__set_app_definition" in prompt
        assert "setta__stream_app_definition" not in prompt
        assert "streamingPreview" not in prompt
        assert "Reference image URL" not in prompt

    def test_build_prompt_returns_none_without_mode(self) -> None:
        assert _build_app_generation_mode_prompt(mode=None) is None

    def test_build_prompt_ignores_reference_image_fields_and_keeps_prompt_builder_guidance(
        self,
    ) -> None:
        prompt = _build_app_generation_mode_prompt(mode="prompt_builder")
        if prompt is None:
            raise AssertionError("Expected an app-generation mode prompt")
        assert "mode: prompt_builder" in prompt
        assert "Project Chat can persist the result directly" in prompt
        assert "Reference image URL" not in prompt

    def test_image_mode_requires_an_attached_image(self) -> None:
        with pytest.raises(HTTPException) as exc:
            _require_image_attachment_for_app_generation_mode(
                "json_render_with_image",
                [UserChatMessage(id="msg-user", attachments=[])],
            )

        assert exc.value.status_code == 400
        assert (
            exc.value.detail
            == "json_render_with_image requires at least one image attachment."
        )

    def test_image_mode_accepts_messages_with_image_attachments(self) -> None:
        _require_image_attachment_for_app_generation_mode(
            "json_render_with_image",
            [
                UserChatMessage(
                    id="msg-user",
                    attachments=[
                        {
                            "id": "image-1",
                            "name": "reference.png",
                            "mimeType": "image/png",
                        }
                    ],
                )
            ],
        )

    def test_image_mode_accepts_retained_image_history_without_new_attachment(
        self,
    ) -> None:
        # A follow-up turn should stay valid when the thread already contains a
        # prior user-supplied reference image.
        _require_image_attachment_for_app_generation_mode(
            "json_render_with_image",
            [
                UserChatMessage(
                    id="msg-image",
                    attachments=[
                        {
                            "id": "image-1",
                            "name": "reference.png",
                            "mimeType": "image/png",
                        }
                    ],
                ),
                UserChatMessage(id="msg-follow-up", attachments=[]),
            ],
        )

    def test_normalize_app_generation_by_message_id_filters_non_user_entries(
        self,
    ) -> None:
        normalized = _normalize_app_generation_by_message_id(
            messages=[
                UserChatMessage(id="msg-user"),
            ],
            app_generation_by_message_id={
                "msg-user": "json_render",
                "missing": "mcp_server",
            },
            submitted_message_id="msg-user",
            submitted_mode=None,
        )

        assert normalized == {}

    def test_normalize_app_generation_by_message_id_overrides_submitted_message_mode(
        self,
    ) -> None:
        normalized = _normalize_app_generation_by_message_id(
            messages=[
                UserChatMessage(id="msg-a"),
                UserChatMessage(id="msg-b"),
            ],
            app_generation_by_message_id={
                "msg-a": "prompt_builder",
                "msg-b": "json_render",
            },
            submitted_message_id="msg-b",
            submitted_mode="mcp_server",
        )

        assert normalized == {
            "msg-a": "prompt_builder",
            "msg-b": "mcp_server",
        }

    def test_get_run_app_generation_by_message_id_reads_authoritative_mapping(
        self,
    ) -> None:
        run = AgentRun.model_validate(
            {
                "id": "run-1",
                "profileId": None,
                "status": "completed",
                "startedAt": "2026-03-10T00:00:00Z",
                "finishedAt": "2026-03-10T00:00:01Z",
                "events": [],
                "inputs": {
                    "messages": [
                        {
                            "id": "msg-a",
                            "role": "user",
                            "content": [],
                            "attachments": [],
                        },
                        {
                            "id": "msg-b",
                            "role": "user",
                            "content": [],
                            "attachments": [],
                        },
                    ],
                    "appGenerationByMessageId": {
                        "msg-a": "prompt_builder",
                        "msg-b": "json_render",
                    },
                },
                "outputs": {},
                "toolCalls": [],
                "cost": None,
            }
        )

        assert _get_run_app_generation_by_message_id(run) == {
            "msg-a": "prompt_builder",
            "msg-b": "json_render",
        }

    def test_get_run_app_generation_by_message_id_ignores_legacy_mode_without_mapping(
        self,
    ) -> None:
        run = AgentRun.model_validate(
            {
                "id": "run-legacy",
                "profileId": None,
                "status": "completed",
                "startedAt": "2026-03-10T00:00:00Z",
                "finishedAt": "2026-03-10T00:00:01Z",
                "events": [],
                "inputs": {
                    "messages": [
                        {
                            "id": "msg-legacy",
                            "role": "user",
                            "content": [],
                            "attachments": [],
                        }
                    ],
                    "appGenerationMode": "mcp_server",
                },
                "outputs": {},
                "toolCalls": [],
                "cost": None,
            }
        )

        assert _get_run_app_generation_by_message_id(run) == {}
