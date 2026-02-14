import pytest

from setta.routers.ai import (
    _build_app_generation_mode_prompt,
    _infer_app_generation_mode_from_user_message,
    _normalize_app_generation_mode,
)


class TestAIAppGenerationModeHelpers:
    """Unit tests for app-generation mode routing helpers in AI routes."""

    @pytest.mark.parametrize(
        ("raw_mode", "expected"),
        [
            # Explicit mode values must normalize to a supported mode.
            ("json_render", "json_render"),
            ("json_render_with_image", "json_render_with_image"),
            ("prompt_builder", "prompt_builder"),
            ("mcp_server", "mcp_server"),
            # Unknown values should not silently map to a mode.
            ("unknown", None),
            ("", None),
            (None, None),
        ],
    )
    def test_normalize_mode(self, raw_mode: str | None, expected: str | None) -> None:
        assert _normalize_app_generation_mode(raw_mode) == expected

    @pytest.mark.parametrize(
        ("message_text", "expected_mode"),
        [
            # Chat users can request direct JSON-render generation.
            ("Please use json render to build a standalone app", "json_render"),
            # Image terms plus app-generation terms should choose image-guided mode.
            (
                "Use json render with a reference image and match this screenshot",
                "json_render_with_image",
            ),
            # Prompt-builder requests should route to prompt-builder mode.
            ("Could you build a prompt builder flow for appgen?", "prompt_builder"),
            # Figma/MCP requests should route to mcp_server mode.
            ("Use MCP to pull a Figma design into Setta", "mcp_server"),
            # Irrelevant text should not force app-generation mode.
            ("How do I rename a section?", None),
        ],
    )
    def test_infer_mode_from_chat_message(
        self,
        message_text: str,
        expected_mode: str | None,
    ) -> None:
        assert (
            _infer_app_generation_mode_from_user_message(message_text) == expected_mode
        )

    def test_build_prompt_includes_streaming_and_reference_image_context(self) -> None:
        prompt = _build_app_generation_mode_prompt(
            mode="json_render_with_image",
            app_spec_streaming_enabled=True,
            reference_image_url="https://example.com/reference.png",
            reference_image_notes="Match spacing and heading scale first.",
        )
        if prompt is None:
            raise AssertionError("Expected an app-generation mode prompt")
        assert "mode: json_render_with_image" in prompt
        assert "streamingPreview: enabled" in prompt
        assert "setta__stream_app_definition" in prompt
        assert "Reference image URL: https://example.com/reference.png" in prompt
        assert "Match spacing and heading scale first." in prompt

    def test_build_prompt_returns_none_without_mode_or_streaming(self) -> None:
        prompt = _build_app_generation_mode_prompt(
            mode=None,
            app_spec_streaming_enabled=False,
            reference_image_url=None,
            reference_image_notes=None,
        )
        assert prompt is None
