from setta.llm.user_facing_errors import get_user_facing_llm_error_message


def test_extracts_message_from_embedded_json_bytes_repr() -> None:
    exc = RuntimeError(
        "litellm.BadRequestError: AnthropicException - "
        'b\'{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_123"}\''
    )

    assert (
        get_user_facing_llm_error_message(exc)
        == "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."
    )


def test_returns_none_for_non_llm_errors() -> None:
    assert get_user_facing_llm_error_message(RuntimeError("boom")) is None
