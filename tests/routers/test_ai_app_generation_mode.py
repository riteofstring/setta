from fastapi import HTTPException

from setta.routers.ai import (
    _build_app_generation_mode_prompt,
    _normalize_reference_image_inputs,
)


class TestAIAppGenerationModeHelpers:
    """Unit tests for app-generation mode routing helpers in AI routes."""

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

    def test_build_prompt_returns_none_when_mode_is_missing_even_if_streaming_enabled(
        self,
    ) -> None:
        prompt = _build_app_generation_mode_prompt(
            mode=None,
            app_spec_streaming_enabled=True,
            reference_image_url=None,
            reference_image_notes=None,
        )
        assert prompt is None

    def test_build_prompt_ignores_reference_image_for_non_image_modes(self) -> None:
        prompt = _build_app_generation_mode_prompt(
            mode="prompt_builder",
            app_spec_streaming_enabled=True,
            reference_image_url="https://example.com/reference.png",
            reference_image_notes="Ignore this outside image mode.",
        )
        if prompt is None:
            raise AssertionError("Expected an app-generation mode prompt")
        assert "mode: prompt_builder" in prompt
        assert "Reference image URL" not in prompt
        assert "Ignore this outside image mode." not in prompt

    def test_build_prompt_mcp_mode_uses_stream_tool_when_streaming_enabled(
        self,
    ) -> None:
        # MCP mode should follow the same stream-vs-full-spec contract as json_render.
        prompt = _build_app_generation_mode_prompt(
            mode="mcp_server",
            app_spec_streaming_enabled=True,
            reference_image_url=None,
            reference_image_notes=None,
        )
        if prompt is None:
            raise AssertionError("Expected an app-generation mode prompt")
        assert "setta__stream_app_definition" in prompt
        assert "setta__set_app_definition" not in prompt

    def test_build_prompt_mcp_mode_uses_full_spec_tool_when_streaming_disabled(
        self,
    ) -> None:
        # Disabled streaming should never advertise stream persistence in MCP mode.
        prompt = _build_app_generation_mode_prompt(
            mode="mcp_server",
            app_spec_streaming_enabled=False,
            reference_image_url=None,
            reference_image_notes=None,
        )
        if prompt is None:
            raise AssertionError("Expected an app-generation mode prompt")
        assert "setta__set_app_definition" in prompt
        assert "setta__stream_app_definition" not in prompt

    def test_reference_image_inputs_are_trimmed_and_empty_values_are_normalized(
        self,
    ) -> None:
        reference_image_url, reference_image_notes = _normalize_reference_image_inputs(
            reference_image_url="  https://example.com/reference.png  ",
            reference_image_notes="  Match spacing first.  ",
        )
        assert reference_image_url == "https://example.com/reference.png"
        assert reference_image_notes == "Match spacing first."

        empty_url, empty_notes = _normalize_reference_image_inputs(
            reference_image_url="   ",
            reference_image_notes=None,
        )
        assert empty_url is None
        assert empty_notes is None

    def test_reference_image_url_has_max_length_guard(self) -> None:
        try:
            _normalize_reference_image_inputs(
                reference_image_url="x" * 4097,
                reference_image_notes=None,
            )
        except HTTPException as exc:
            assert exc.status_code == 400
            assert "appGenerationReferenceImageUrl is too large" in str(exc.detail)
        else:
            raise AssertionError("Expected HTTPException for oversized reference URL")

    def test_reference_image_notes_has_max_length_guard(self) -> None:
        try:
            _normalize_reference_image_inputs(
                reference_image_url=None,
                reference_image_notes="x" * 100001,
            )
        except HTTPException as exc:
            assert exc.status_code == 400
            assert "appGenerationReferenceImageNotes is too large" in str(exc.detail)
        else:
            raise AssertionError("Expected HTTPException for oversized reference notes")
